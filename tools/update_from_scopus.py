"""Add papers from Scopus that are not yet in js/data.js.

Usage (run from anywhere, on a network where the Scopus key is accepted):

    python tools/update_from_scopus.py            # only list what is new
    python tools/update_from_scopus.py --apply    # also write them into js/data.js

The API key is read from the SCOPUS_API_KEY environment variable, or from a
file named .scopus_key in the folder above this repository. Never commit it.
"""
import difflib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

AUTHOR_ID = "57216740438"
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, "js", "data.js")
KEY_FILE = os.path.join(os.path.dirname(REPO), ".scopus_key")
SEARCH = "https://api.elsevier.com/content/search/scopus?query=AU-ID(%s)&count=25&start=%d&sort=-coverDate"

# Words that keep their capitals when a title is turned into sentence case.
KEEP = {"IoT", "AI", "MRI", "DNA", "SHAP", "TOTP", "JWT", "TOPSIS", "KMS", "CNN", "DCT", "AWS", "ECC", "CASB",
        "COVID-19", "QSAR", "CSF", "DLP", "IRM", "RSM", "5G", "LLM", "LLMs", "IEEE", "ML", "XAI", "UAV", "SVM",
        "LSTM", "GAN", "GANs", "NLP", "QR", "LPWAN", "IDS", "SDN", "WSN", "X-ray", "ViT-HAR", "GSR-C2N"}


def api_key():
    key = os.environ.get("SCOPUS_API_KEY", "").strip()
    if not key and os.path.exists(KEY_FILE):
        key = open(KEY_FILE).read().strip()
    if not key:
        sys.exit("No Scopus key found. Set SCOPUS_API_KEY or create %s" % KEY_FILE)
    return key


def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def fetch_scopus(key):
    headers = {"X-ELS-APIKey": key, "Accept": "application/json"}
    entries, start = [], 0
    while True:
        try:
            res = get_json(SEARCH % (AUTHOR_ID, start), headers)["search-results"]
        except urllib.error.HTTPError as e:
            sys.exit("Scopus refused the request (HTTP %d). The key usually only works on the university network." % e.code)
        batch = [e for e in res.get("entry", []) if e.get("dc:title")]
        entries += batch
        start += 25
        if not batch or start >= int(res["opensearch:totalResults"]):
            return entries


def norm(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def sentence_case(title):
    """Scopus titles are mostly sentence case already; only tidy whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title)).strip()


def initials(given):
    parts = re.split(r"[\s.\-]+", given.strip())
    return " ".join(p[0].upper() + "." for p in parts if p)


def crossref_authors(doi):
    """Full author list from Crossref, formatted like the rest of the site."""
    try:
        msg = get_json("https://api.crossref.org/works/" + urllib.parse.quote(doi),
                       {"User-Agent": "portfolio-updater (mailto:shahnawaz.ahmad@bennett.edu.in)"})["message"]
    except Exception:
        return None
    people = [a for a in msg.get("author", []) if a.get("family")]
    if not people:
        return None
    names = ["%s, %s" % (a["family"].strip(), initials(a.get("given", ""))) for a in people]
    names = [n.rstrip(", ") for n in names]
    if not any(n.startswith("Ahmad, S") for n in names):
        return None
    if len(names) > 7:
        return ", ".join(names[:7]) + " et al."
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + ", & " + names[-1]


def fallback_authors(creator):
    m = re.match(r"(.+?)\s+([A-Z][A-Z.\-]*)$", creator or "")
    first = "%s, %s" % (m.group(1), " ".join(c + "." for c in re.sub(r"[^A-Z]", "", m.group(2)))) if m else (creator or "")
    if first.startswith("Ahmad, S"):
        return "Ahmad, S. et al."
    return "%s, Ahmad, S. et al." % first if first else "Ahmad, S. et al."


def details(e):
    vol, issue, pages, art = (e.get(k) for k in ("prism:volume", "prism:issueIdentifier", "prism:pageRange", "article-number"))
    out = (vol or "") + ("(%s)" % issue if issue else "")
    tail = (pages or art or "").replace("-", "–")
    return ", ".join(x for x in (out, tail) if x)


def bucket(e):
    agg, sub = e.get("prism:aggregationType", ""), e.get("subtypeDescription", "")
    if sub == "Conference Paper" or agg == "Conference Proceeding":
        return "conferences"
    if sub == "Book Chapter":
        return "chapters"
    if agg == "Journal":
        return "journals"
    return None  # whole books, editorials, errata: add these by hand


def js_str(text):
    return json.dumps(text, ensure_ascii=False)


def make_line(e):
    doi = e.get("prism:doi")
    authors = (crossref_authors(doi) if doi else None) or fallback_authors(e.get("dc:creator"))
    fields = ["a: " + js_str(authors), "y: " + e.get("prism:coverDate", "0000")[:4],
              "t: " + js_str(sentence_case(e["dc:title"])), "v: " + js_str(e.get("prism:publicationName", ""))]
    if details(e):
        fields.append("d: " + js_str(details(e)))
    if doi:
        fields.append("doi: " + js_str(doi))
    return "    { " + ", ".join(fields) + " }"


def insert(src, name, year, line):
    """Put the entry in list `name`, ahead of the first entry from an earlier year."""
    m = re.search(r"\n  %s: \[\n(.*?)\n  \]" % name, src, flags=re.S)
    rows = m.group(1).split("\n")
    at = len(rows)
    for i, row in enumerate(rows):
        y = re.search(r"\by: (\d{4})", row)
        if y and int(y.group(1)) < year:
            at = i
            break
    rows = [r if r.rstrip().endswith(",") or i == len(rows) - 1 else r for i, r in enumerate(rows)]
    if at == len(rows):
        rows[-1] = rows[-1].rstrip().rstrip(",") + ","
        rows.append(line)
    else:
        rows.insert(at, line + ",")
    return src[:m.start(1)] + "\n".join(rows) + src[m.end(1):]


def main():
    apply = "--apply" in sys.argv
    src = open(DATA, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    titles = [norm(t) for t in re.findall(r'\bt: ("(?:[^"\\]|\\.)*")', src) for t in [json.loads(t)]]
    dois = {d.lower() for d in re.findall(r'\bdoi: "([^"]+)"', src)}

    def on_site(e):
        t = norm(e["dc:title"])
        if e.get("prism:doi", "").lower() in dois:
            return True
        return any(t == s or difflib.SequenceMatcher(None, t, s).ratio() > 0.92 for s in titles)

    entries = fetch_scopus(api_key())
    new = [e for e in entries if not on_site(e)]
    print("Scopus records: %d | already on the site: %d | new: %d" % (len(entries), len(entries) - len(new), len(new)))

    added, skipped = 0, []
    for e in sorted(new, key=lambda e: e.get("prism:coverDate", "")):
        where = bucket(e)
        label = "%s | %s | %s | %s" % (e.get("prism:coverDate", "")[:4], e.get("subtypeDescription"), e["dc:title"][:90], e.get("prism:publicationName", "")[:50])
        if not where:
            skipped.append(label)
            continue
        print("  + [%s] %s" % (where, label))
        if apply:
            src = insert(src, where, int(e.get("prism:coverDate", "0000")[:4]), make_line(e))
            added += 1
    for s in skipped:
        print("  ? not added automatically (book/editorial): " + s)

    if apply and added:
        open(DATA, "w", encoding="utf-8", newline="").write(src)
        print("\nWrote %d new entries to js/data.js. Open index.html to check, then commit and push." % added)
    elif not apply and new:
        print("\nNothing was changed. Run again with --apply to add them.")


if __name__ == "__main__":
    main()
