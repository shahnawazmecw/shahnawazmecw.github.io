(function () {
  "use strict";

  var CV = window.CV;
  var root = document.documentElement;
  root.classList.add("js");

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- Theme ---------- */
  $("themeBtn").addEventListener("click", function () {
    var current = root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  /* ---------- Nav ---------- */
  var nav = $("nav"), links = $("navLinks"), menuBtn = $("menuBtn");
  function closeMenu() {
    links.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", function () {
    var open = links.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", function (e) { if (e.target.tagName === "A") closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("scroll", function () {
    nav.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  var navItems = Array.prototype.slice.call(links.querySelectorAll("a"));
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navItems.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navItems.forEach(function (a) {
      var s = document.querySelector(a.getAttribute("href"));
      if (s) spy.observe(s);
    });
  }

  /* ---------- Publications ---------- */
  var LABEL = { journals: "journal articles", conferences: "conference papers", chapters: "book chapters", books: "books" };
  var PAGE = 10;
  var state = { tab: "journals", q: "", year: "", all: false };
  var pubs = $("pubs"), more = $("more"), count = $("pubCount"), yearSel = $("year"), q = $("q");
  var tabs = Array.prototype.slice.call($("tabs").querySelectorAll("button"));

  tabs.forEach(function (b) {
    b.querySelector("b").textContent = CV[b.dataset.tab].length;
  });

  // Bold the site owner's name inside an author list (not "Ahmad, J.").
  function authors(text) {
    var p = el("p", "pub-a");
    var re = /Shahnawaz Ahmad|Ahmad, S\.(?!\s?[A-Z]\.)/g, last = 0, m;
    while ((m = re.exec(text))) {
      p.appendChild(document.createTextNode(text.slice(last, m.index)));
      p.appendChild(el("b", null, m[0]));
      last = m.index + m[0].length;
    }
    p.appendChild(document.createTextNode(text.slice(last)));
    return p;
  }

  function copyCitation(p, btn) {
    var text = p.a.replace(/\.$/, "") + ". (" + p.y + "). " + p.t + ". " + p.v + (p.d ? ", " + p.d : "") + "." +
      (p.doi ? " https://doi.org/" + p.doi : "");
    function done(ok) {
      btn.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(function () { btn.textContent = "Copy citation"; }, 1600);
    }
    function fallback() {
      var ta = el("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  function linkRow(p) {
    var l = el("p", "pub-l");
    if (p.doi) {
      var d = el("a", null, "DOI");
      d.href = "https://doi.org/" + p.doi;
      d.title = p.doi;
      d.target = "_blank"; d.rel = "noopener";
      l.appendChild(d);
    }
    var s = el("a", null, "Scholar");
    s.href = "https://scholar.google.com/scholar?q=" + encodeURIComponent(p.t);
    s.target = "_blank"; s.rel = "noopener";
    l.appendChild(s);
    var c = el("button", null, "Copy citation");
    c.type = "button";
    c.addEventListener("click", function () { copyCitation(p, c); });
    l.appendChild(c);
    return l;
  }

  CV.journals.forEach(function (p) {
    if (!p.sel) return;
    var li = el("li");
    var v = el("span", "venue", p.v);
    v.appendChild(el("b", null, p.y));
    li.appendChild(v);
    li.appendChild(el("h4", "pub-t", p.t));
    li.appendChild(authors(p.a));
    li.appendChild(linkRow(p));
    $("selected").appendChild(li);
  });

  function fillYears() {
    var years = {};
    CV[state.tab].forEach(function (p) { years[p.y] = true; });
    yearSel.length = 1;
    Object.keys(years).sort().reverse().forEach(function (y) {
      var o = el("option", null, y);
      o.value = y;
      yearSel.appendChild(o);
    });
    yearSel.value = years[state.year] ? state.year : "";
    state.year = yearSel.value;
  }

  function render() {
    var list = CV[state.tab];
    var needle = state.q.trim().toLowerCase();
    var rows = [];
    list.forEach(function (p, i) {
      if (state.year && String(p.y) !== state.year) return;
      if (needle && [p.t, p.a, p.v, p.d || "", p.y].join(" ").toLowerCase().indexOf(needle) === -1) return;
      rows.push({ p: p, n: i + 1 });
    });

    var filtered = Boolean(needle || state.year);
    var shown = (state.all || filtered) ? rows : rows.slice(0, PAGE);

    pubs.textContent = "";
    shown.forEach(function (r) {
      var p = r.p, li = el("li");
      li.appendChild(el("span", "pub-n", (r.n < 10 ? "0" : "") + r.n));
      li.appendChild(el("span", "pub-y", p.y));
      var body = el("div", "pub-body");
      body.appendChild(el("h3", "pub-t", p.t));
      body.appendChild(authors(p.a));
      var v = el("p", "pub-v");
      v.appendChild(el("i", null, p.v));
      if (p.d) v.appendChild(document.createTextNode(", " + p.d));
      body.appendChild(v);
      body.appendChild(linkRow(p));
      li.appendChild(body);
      pubs.appendChild(li);
    });
    if (!rows.length) pubs.appendChild(el("li", "empty", "No publications match that search."));

    count.textContent = filtered
      ? rows.length + " of " + list.length + " " + LABEL[state.tab] + " match"
      : "Showing " + shown.length + " of " + list.length + " " + LABEL[state.tab];

    more.hidden = filtered || list.length <= PAGE;
    more.textContent = state.all ? "Show fewer" : "Show all " + list.length + " " + LABEL[state.tab];
  }

  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      state.tab = b.dataset.tab;
      state.all = false;
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t === b)); });
      fillYears();
      render();
    });
  });
  q.addEventListener("input", function () { state.q = q.value; render(); });
  yearSel.addEventListener("change", function () { state.year = yearSel.value; render(); });
  more.addEventListener("click", function () {
    state.all = !state.all;
    render();
    if (!state.all) $("research").scrollIntoView();
  });
  fillYears();
  render();

  /* ---------- Output-by-year chart ---------- */
  (function () {
    var byYear = {};
    function add(list, key) {
      list.forEach(function (p) {
        byYear[p.y] = byYear[p.y] || { j: 0, c: 0, b: 0 };
        byYear[p.y][key]++;
      });
    }
    add(CV.journals, "j"); add(CV.conferences, "c"); add(CV.chapters, "b"); add(CV.books, "b");
    var years = Object.keys(byYear).sort();
    var max = Math.max.apply(null, years.map(function (y) { var v = byYear[y]; return v.j + v.c + v.b; }));
    var names = { j: "journal articles", c: "conference papers", b: "books and chapters" };
    var bars = $("bars");
    years.forEach(function (y) {
      var v = byYear[y], total = v.j + v.c + v.b;
      var bar = el("div", "bar");
      bar.appendChild(el("span", "bar-n", total));
      var stack = el("div", "bar-stack");
      stack.style.height = "calc((100% - 58px) * " + (total / max).toFixed(4) + ")";
      ["b", "c", "j"].forEach(function (k) {
        if (!v[k]) return;
        var seg = el("i", "seg-" + k);
        seg.style.flex = v[k];
        seg.title = y + ": " + v[k] + " " + names[k];
        stack.appendChild(seg);
      });
      bar.appendChild(stack);
      bar.appendChild(el("span", "bar-y", y));
      bar.setAttribute("aria-label", y + ": " + total + " publications");
      bars.appendChild(bar);
    });
  })();

  /* ---------- Patents ---------- */
  CV.patents.forEach(function (p) {
    var li = el("li");
    var top = el("div", "pat-top");
    top.appendChild(el("span", "tag", p.o));
    top.appendChild(el("span", "tag kind", p.k));
    top.appendChild(el("span", "when", p.w));
    li.appendChild(top);
    li.appendChild(el("h3", null, p.t));
    li.appendChild(el("p", "pat-no", p.n));
    $("patentList").appendChild(li);
  });

  /* ---------- Courses ---------- */
  CV.courses.forEach(function (c) {
    var box = el("div", "course");
    var h = el("h4", null, c.by);
    h.appendChild(el("span", null, c.list.length + (c.list.length > 1 ? " courses" : " course")));
    box.appendChild(h);
    var ul = el("ul");
    c.list.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    box.appendChild(ul);
    $("courses").appendChild(box);
  });

  /* ---------- Reviewer ---------- */
  CV.reviewer.forEach(function (r) {
    var li = el("li", null, r[0]);
    if (r[1]) li.appendChild(el("span", null, r[1]));
    $("reviewerList").appendChild(li);
  });

  /* ---------- Stats ---------- */
  var totals = {
    journals: CV.journals.length,
    conferences: CV.conferences.length,
    patents: CV.patents.length,
    booksAndChapters: CV.books.length + CV.chapters.length
  };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var statEls = Array.prototype.slice.call(document.querySelectorAll("#stats dd"));
  statEls.forEach(function (dd) {
    var key = dd.dataset.count;
    dd.dataset.to = totals[key] != null ? totals[key] : key;
    dd.textContent = dd.dataset.to + (dd.dataset.suffix || "");
  });
  function countUp(dd) {
    var to = Number(dd.dataset.to), suffix = dd.dataset.suffix || "", start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / 900, 1);
      dd.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Reveal on scroll ---------- */
  var targets = document.querySelectorAll(".sec-head, .sec-body, .chart, .pub-tools, .pubs, .patents, .stats, .contact-grid");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        if (en.target.id === "stats") statEls.forEach(countUp);
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    Array.prototype.forEach.call(targets, function (t) { t.classList.add("reveal"); io.observe(t); });
  }

  $("yr").textContent = new Date().getFullYear();
})();
