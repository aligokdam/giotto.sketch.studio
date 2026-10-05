/* Giotto Sketch Studio: localization
   Strings live in assets/i18n/<code>.json. English is the fallback for any
   missing key. To add a language: create <code>.json and add one line below. */
(function () {
  "use strict";

  var LANGUAGES = [
    { code: "en", name: "English" },
    { code: "fil", name: "Filipino" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "ha", name: "Hausa" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "it", name: "Italiano" },
    { code: "pt", name: "Português" },
    { code: "es", name: "Español" },
    { code: "tr", name: "Türkçe" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "ar", name: "العربية", rtl: true },
    { code: "fa", name: "فارسی", rtl: true },
    { code: "ur", name: "اردو", rtl: true },
    { code: "ru", name: "Русский" },
    { code: "zh", name: "中文" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "hi", name: "हिन्दी" },
    { code: "mr", name: "मराठी" },
    { code: "bn", name: "বাংলা" },
    { code: "pa", name: "ਪੰਜਾਬੀ" },
    { code: "ta", name: "தமிழ்" },
    { code: "te", name: "తెలుగు" }
  ];
  var LINKS = {
    privacy: "#privacy",
    terms: "#terms",
    github: "https://github.com/aligokdam/giotto.sketch.studio"
  };
  /* Cache-busting: matches <meta name="version"> so a new release is never served from a stale cache. */
  var VERSION = (document.querySelector('meta[name="version"]') || {}).content || "1";
  var DEFAULT = "en";
  var STORAGE_KEY = "giotto-lang";

  var cache = {};
  var dict = {};
  var fallback = {};
  var current = DEFAULT;
  var listeners = [];

  function find(code) {
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].code === code) return LANGUAGES[i];
    return null;
  }

  function stored() {
    try { var c = localStorage.getItem(STORAGE_KEY); if (c && find(c)) return c; } catch (e) {}
    return null;
  }

  /* First visit: match the browser language (e.g. tr-TR -> tr), else English. */
  function detect() {
    var prefs = navigator.languages || [navigator.language || DEFAULT];
    for (var i = 0; i < prefs.length; i++) {
      var p = String(prefs[i] || "").toLowerCase();
      if (find(p)) return p;
      var base = p.split("-")[0];
      if (find(base)) return base;
    }
    return DEFAULT;
  }

  function load(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    return fetch("assets/i18n/" + code + ".json?v=" + VERSION)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { cache[code] = data; return data; });
  }

  function t(key) {
    if (dict[key] !== undefined) return dict[key];
    if (fallback[key] !== undefined) return fallback[key];
    return key;
  }

  /* Fill every element marked with data-i18n (text) and data-i18n-aria (aria-label). */
  function apply(root) {
    root = root || document;
    var els = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    /* data-i18n-rich: text where [[…]] becomes a link (data-link = privacy | terms | github). */
    els = root.querySelectorAll("[data-i18n-rich]");
    for (i = 0; i < els.length; i++) {
      var el = els[i];
      var href = LINKS[el.getAttribute("data-link")] || "#home";
      var parts = String(t(el.getAttribute("data-i18n-rich"))).split(/\[\[|\]\]/);
      el.textContent = "";
      for (var j = 0; j < parts.length; j++) {
        if (j % 2 === 0) { el.appendChild(document.createTextNode(parts[j])); continue; }
        var a = document.createElement("a");
        a.href = href;
        a.textContent = parts[j];
        if (el.getAttribute("data-link") === "privacy") a.setAttribute("data-sheet", "privacy");
        if (href.charAt(0) !== "#") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        el.appendChild(a);
      }
    }
    els = root.querySelectorAll("[data-i18n-aria]");
    for (i = 0; i < els.length; i++) {
      var label = t(els[i].getAttribute("data-i18n-aria"));
      els[i].setAttribute("aria-label", label);
      if (els[i].hasAttribute("title")) els[i].setAttribute("title", label);
    }
  }

  function setLanguage(code, persist) {
    if (!find(code)) code = DEFAULT;
    return Promise.all([load(DEFAULT), code === DEFAULT ? null : load(code).catch(function () { return null; })])
      .then(function (res) {
        fallback = res[0];
        dict = res[1] || res[0];
        current = res[1] || code === DEFAULT ? code : DEFAULT;
        var lang = find(current);
        document.documentElement.lang = current;
        document.documentElement.dir = lang.rtl ? "rtl" : "ltr";
        if (persist) { try { localStorage.setItem(STORAGE_KEY, current); } catch (e) {} }
        apply(document);
        listeners.forEach(function (fn) { fn(current); });
        return current;
      });
  }

  window.GiottoI18n = {
    languages: LANGUAGES,
    storageKey: STORAGE_KEY,
    t: t,
    apply: apply,
    current: function () { return current; },
    nameOf: function (code) { var l = find(code); return l ? l.name : code; },
    init: function () { return setLanguage(stored() || detect(), false); },
    set: function (code) { return setLanguage(code, true); },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return setLanguage(detect(), false);
    },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
