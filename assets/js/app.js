/* Giotto Sketch Studio: app shell
   Theme (system/light/dark), hash router (#home #faq #privacy #terms #studio …)
   and the settings sheet. The studio itself lives in studio.js. */
(function () {
  "use strict";

  var I18N = window.GiottoI18n;
  var Studio = window.GiottoStudio;
  var t = I18N.t;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  /* ============================= THEME ============================= */
  var Theme = (function () {
    var KEY = "giotto-theme";
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    var pref = "system";
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === "main") saved = "dark"; // value used by v1
      if (saved === "light" || saved === "dark") pref = saved;
    } catch (e) {}

    var meta = document.querySelector('meta[name="theme-color"]');

    function apply() {
      var resolved = pref === "system" ? (mq && mq.matches ? "light" : "dark") : pref;
      root.setAttribute("data-theme", resolved);
      if (meta) meta.setAttribute("content", resolved === "light" ? "#ffffff" : "#000000");
      var btns = document.querySelectorAll("[data-theme-choice]");
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute("aria-checked", String(btns[i].getAttribute("data-theme-choice") === pref));
      }
    }

    if (mq) {
      var onSystem = function () { if (pref === "system") apply(); };
      if (mq.addEventListener) mq.addEventListener("change", onSystem);
      else if (mq.addListener) mq.addListener(onSystem);
    }

    return {
      apply: apply,
      set: function (p) {
        pref = p === "light" || p === "dark" ? p : "system";
        try {
          if (pref === "system") localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, pref);
        } catch (e) {}
        apply();
      }
    };
  })();

  /* ============================= ROUTER ============================= */
  var PAGES = { home: 1, privacy: 1, terms: 1 };
  var SECTIONS = { how: 1, features: 1, faq: 1 };
  var STUDIO = { "studio": "upload", "studio/edit": "editor", "studio/camera": "camera" };
  var site = $("site");
  var app = $("app");
  var current = null;

  function parse(hash) {
    var p = String(hash || "").replace(/^#\/?/, "").replace(/\/$/, "");
    if (!p) return "home";
    if (PAGES[p] || SECTIONS[p] || STUDIO[p]) return p;
    return "home";
  }

  /* A path the current session can't show (e.g. reloading on the editor
     with no image) falls back to the nearest screen that makes sense. */
  function resolve(path) {
    if (path === "studio/camera" && !Studio.hasStream()) path = Studio.hasImage() ? "studio/edit" : "studio";
    if (path === "studio/edit" && !Studio.hasImage()) path = "studio";
    return path;
  }

  function render(path, fromNav) {
    var wanted = path;
    path = resolve(path);
    if (path !== wanted) history.replaceState({ path: path, prev: history.state && history.state.prev }, "", "#" + path);
    if (path === current && !SECTIONS[path]) return;
    var prevPath = current;
    current = path;
    Settings.close();

    if (STUDIO[path]) {
      site.hidden = true;
      app.hidden = false;
      root.classList.add("in-studio");
      Studio.show(STUDIO[path]);
      return;
    }

    if (prevPath && STUDIO[prevPath]) Studio.leave();
    app.hidden = true;
    site.hidden = false;
    root.classList.remove("in-studio");

    var page = PAGES[path] ? path : "home";
    var pages = document.querySelectorAll("[data-page]");
    for (var i = 0; i < pages.length; i++) pages[i].hidden = pages[i].getAttribute("data-page") !== page;

    if (SECTIONS[path]) {
      var target = $(path);
      var smooth = fromNav && prevPath && !STUDIO[prevPath] && prevPath !== "privacy" && prevPath !== "terms";
      requestAnimationFrame(function () { target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }); });
    } else {
      window.scrollTo(0, 0);
      if (prevPath) {
        var heading = document.querySelector('[data-page="' + page + '"] h1');
        if (heading) heading.focus({ preventScroll: true });
      }
    }
  }

  /* Navigate. `back: true` means "go to the screen I came from" — if that is
     exactly the previous history entry, step back instead of stacking a new one. */
  function go(path, opts) {
    opts = opts || {};
    var st = history.state;
    if (opts.back && st && st.prev === path) { history.back(); return; }
    var entry = { path: path, prev: current };
    if (opts.replace) history.replaceState(entry, "", "#" + path);
    else history.pushState(entry, "", "#" + path);
    render(path, true);
  }

  window.GiottoRouter = { go: go };

  window.addEventListener("popstate", function () { render(parse(location.hash)); });
  window.addEventListener("hashchange", function () { render(parse(location.hash)); });

  /* Internal links (#…) go through the router so history stays consistent. */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute("href");
    e.preventDefault();
    if (href === "#main") { var m = $("main"); m.setAttribute("tabindex", "-1"); m.focus(); return; } // skip link
    /* Logo: on the home page, glide back to the top instead of re-routing. */
    if (a.hasAttribute("data-scroll-top") && (current === "home" || SECTIONS[current])) {
      if (current !== "home") history.pushState({ path: "home", prev: current }, "", "#home");
      current = "home";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    go(parse(href));
  });

  /* ============================= SETTINGS SHEET ============================= */
  var Settings = (function () {
    var sheet = $("sheet");
    var backdrop = $("sheetBackdrop");
    var title = $("sheetTitle");
    var backBtn = $("sheetBack");
    var backLabel = $("sheetBackLabel");
    var TITLES = { settings: "settingsTitle", language: "langLabel", guide: "guideTitle" };
    var stack = [];
    var opener = null;
    var hideTimer = 0;

    function showView(name) {
      var views = sheet.querySelectorAll(".sheet-view");
      for (var i = 0; i < views.length; i++) views[i].hidden = views[i].getAttribute("data-view") !== name;
      title.textContent = t(TITLES[name]);
      var prev = stack[stack.length - 2];
      backBtn.hidden = !prev;
      backLabel.textContent = prev ? t(TITLES[prev]) : "";
      $("sheetBody").scrollTop = 0;
      if (name === "guide") Studio.renderGuideSteps();
    }

    function open(view) {
      clearTimeout(hideTimer);
      opener = document.activeElement;
      stack = view && view !== "settings" ? [view] : ["settings"];
      showView(stack[0]);
      backdrop.hidden = false;
      sheet.hidden = false;
      document.body.classList.add("sheet-open");
      void sheet.offsetWidth; // commit the un-hidden state so the slide-in transitions
      backdrop.classList.add("show");
      sheet.classList.add("show");
      sheet.focus({ preventScroll: true });
    }

    function close() {
      if (sheet.hidden) return;
      backdrop.classList.remove("show");
      sheet.classList.remove("show");
      document.body.classList.remove("sheet-open");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { sheet.hidden = true; backdrop.hidden = true; }, 260);
      if (opener && opener.focus && document.body.contains(opener) && !opener.closest("[hidden]")) opener.focus({ preventScroll: true });
    }

    function push(view) { stack.push(view); showView(view); }
    function pop() { if (stack.length > 1) { stack.pop(); showView(stack[stack.length - 1]); sheet.focus({ preventScroll: true }); } }

    function renderLanguages() {
      var list = $("langList");
      var hadFocus = list.contains(document.activeElement);
      var cur = I18N.current();
      list.textContent = "";
      I18N.languages.forEach(function (lang) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "row";
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", String(lang.code === cur));
        btn.setAttribute("lang", lang.code);
        btn.dataset.lang = lang.code;
        var label = document.createElement("span");
        label.className = "row-label";
        label.textContent = lang.name;
        var check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "row-check");
        check.setAttribute("aria-hidden", "true");
        var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#i-check");
        check.appendChild(use);
        btn.append(label, check);
        li.appendChild(btn);
        list.appendChild(li);
      });
      $("langValue").textContent = I18N.nameOf(cur);
      if (hadFocus) list.querySelector('[aria-checked="true"]').focus();
    }

    $("langList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-lang]");
      if (btn) I18N.set(btn.dataset.lang);
    });

    sheet.addEventListener("click", function (e) {
      var pushBtn = e.target.closest("[data-push]");
      if (pushBtn) { push(pushBtn.getAttribute("data-push")); return; }
      var choice = e.target.closest("[data-theme-choice]");
      if (choice) { Theme.set(choice.getAttribute("data-theme-choice")); return; }
      if (e.target.closest("[data-close-sheet]")) close();
    });

    $("resetSettings").addEventListener("click", function () {
      if (!window.confirm(t("resetConfirm"))) return;
      Theme.set("system");
      I18N.reset().then(function () { Studio.toast(t("resetDone")); });
    });

    backBtn.addEventListener("click", pop);
    $("sheetDone").addEventListener("click", close);
    backdrop.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (sheet.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = Array.prototype.filter.call(
        sheet.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])"),
        function (el) { return !el.hidden && !el.closest("[hidden]") && el.offsetParent !== null; }
      );
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-open-settings]")) open("settings");
    });

    return {
      open: open,
      close: close,
      refresh: function () {
        renderLanguages();
        var visible = sheet.querySelector(".sheet-view:not([hidden])");
        if (!sheet.hidden && visible) showView(visible.getAttribute("data-view"));
      }
    };
  })();

  window.GiottoSettings = Settings;

  /* ============================= NAV: quick language + theme ============================= */
  $("navLangBtn").addEventListener("click", function () { Settings.open("language"); });
  $("navThemeBtn").addEventListener("click", function () {
    Theme.set(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  /* ============================= HOME: live overlay demo ============================= */
  (function () {
    var range = $("showcaseOpacity");
    var out = $("showcaseVal");
    var guide = document.querySelector(".ill-guide");
    function sync() {
      var v = Number(range.value);
      guide.style.opacity = String(v / 100);
      out.textContent = v + "%";
      range.style.setProperty("--fill-pct", v + "%");
    }
    range.addEventListener("input", sync);
    sync();
  })();

  /* ============================= INIT ============================= */
  function onLanguage() {
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("metaDescription"));
    Settings.refresh();
  }
  I18N.onChange(onLanguage);

  Theme.apply();

  I18N.init()
    .catch(function (err) { console.warn("Giotto: could not load translations", err); })
    .then(function () {
      root.classList.remove("i18n-loading");
      history.replaceState({ path: parse(location.hash), prev: null }, "", location.href);
      render(parse(location.hash));
    });
})();
