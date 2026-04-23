(function () {
  "use strict";

  const dictionary = {};
  const hasOwn = Object.prototype.hasOwnProperty;
  const djangoGettext =
    typeof window.gettext === "function" ? window.gettext.bind(window) : null;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function interpolate(template, params) {
    const text = String(template ?? "");
    if (!isObject(params)) return text;

    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
      if (!hasOwn.call(params, key)) return full;
      const value = params[key];
      return value === null || value === undefined ? "" : String(value);
    });
  }

  function mergeTranslations(source) {
    if (!isObject(source)) return;
    Object.entries(source).forEach(([key, value]) => {
      if (typeof value === "string") {
        dictionary[key] = value;
      }
    });
  }

  function readJsonScript(scriptId, fallback = null) {
    const node = document.getElementById(scriptId);
    if (!node) return fallback;

    try {
      const parsed = JSON.parse(node.textContent || "");
      return parsed;
    } catch (error) {
      console.error(`i18n: JSON inválido en #${scriptId}`, error);
      return fallback;
    }
  }

  function collectInlineDictionaries() {
    document
      .querySelectorAll('script[type="application/json"][data-js-i18n]')
      .forEach((script) => {
        const parsed = readJsonScript(script.id, null);
        if (parsed) mergeTranslations(parsed);
      });
  }

  function translate(key, fallback = null, params = null) {
    let template = null;

    if (typeof key === "string" && hasOwn.call(dictionary, key)) {
      template = dictionary[key];
    } else if (typeof fallback === "string" && hasOwn.call(dictionary, fallback)) {
      template = dictionary[fallback];
    }

    if (template === null) {
      const source = fallback !== null && fallback !== undefined ? fallback : key;
      if (typeof source !== "string") return "";
      template = djangoGettext ? djangoGettext(source) : source;
    }

    return interpolate(template, params);
  }

  function getLocale() {
    return document.documentElement.lang || "es";
  }

  function formatNumber(value, options = {}) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "0";
    return new Intl.NumberFormat(getLocale(), options).format(numericValue);
  }

  function formatCurrency(value, currency = "EUR", options = {}) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return formatNumber(0);

    return new Intl.NumberFormat(getLocale(), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(numericValue);
  }

  collectInlineDictionaries();

  window.TPVI18n = {
    add: mergeTranslations,
    dict: dictionary,
    formatCurrency,
    formatNumber,
    getLocale,
    readJsonScript,
    t: translate,
  };

  window.t = translate;
  window.registerTranslations = mergeTranslations;
  window.readJsonScript = readJsonScript;

  if (typeof window.gettext !== "function") {
    window.gettext = function gettextFallback(message) {
      return translate(message, message);
    };
  }
})();
