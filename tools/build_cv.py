"""Rebuild resume.pdf from cv.html (which reads the publication lists in js/data.js).

    python tools/build_cv.py

Needs Chrome, Chromium or Edge. Set the CHROME environment variable to point at
a specific browser if it is not found automatically.
"""
import os
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
CANDIDATES = [
    os.environ.get("CHROME", ""),
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def browser():
    for c in CANDIDATES:
        if c and (os.path.isfile(c) or shutil.which(c)):
            return c if os.path.isfile(c) else shutil.which(c)
    sys.exit("No Chrome, Chromium or Edge found. Set CHROME to the browser's path.")


def main():
    out = REPO / "resume.pdf"
    tmp = REPO / "resume.tmp.pdf"
    cmd = [browser(), "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
           "--virtual-time-budget=10000", "--print-to-pdf=" + str(tmp), (REPO / "cv.html").as_uri()]
    subprocess.run(cmd, check=False, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not tmp.exists() or tmp.stat().st_size < 50000:
        sys.exit("The browser did not produce a PDF.")
    tmp.replace(out)
    print("Wrote %s (%d KB)" % (out.name, out.stat().st_size // 1024))


if __name__ == "__main__":
    main()
