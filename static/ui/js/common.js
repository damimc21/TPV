/* common.js
   JS global para todas las páginas con el layout base (topbar/sidebar/footer).
   - Sidebar (hamburguesa)
   - Dropdown ☰ (tema/idioma/login)
   - Dropdown usuario
   - Tema (localStorage)
   - Idioma (Django set_language si existe langForm)
   - Reloj
   - Marca visual de seleccionado (tema/idioma)
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function logUiEvent(evento, detalle, nivel = "INFO", origen = "ui.tema") {
    if (window.TpvUtils && typeof window.TpvUtils.logUiEvent === "function") {
      window.TpvUtils.logUiEvent(evento, detalle, nivel, origen);
    }
  }

  // ---------------------------
  // Tema (dark/light)
  // ---------------------------
  function setTheme(theme) {
    const previous = document.documentElement.getAttribute("data-theme") || getSavedTheme();
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("tpv_theme", theme); } catch (_) { }
    if (theme && theme !== previous) {
      logUiEvent("theme_change", `from=${previous} to=${theme}`);
    }
  }

  function getSavedTheme() {
    try { return localStorage.getItem("tpv_theme") || "dark"; } catch (_) { }
    return "dark";
  }

  function markSelectedTheme(theme) {
    const dropdown = $("#menuDropdown");
    if (!dropdown) return;

    $$(".dropdown__item[data-set-theme]", dropdown).forEach(btn => {
      btn.classList.toggle("is-selected", btn.dataset.setTheme === theme);
    });
  }

  // ---------------------------
  // Idioma (Django set_language)
  // ---------------------------
  function setLanguage(lang) {
    const form = $("#langForm");
    const input = $("#langInput");
    if (!form || !input) return;
    const nextInput = form.querySelector("input[name='next']");

    const currentLang = (document.documentElement.lang || "unknown").toLowerCase().split("-")[0];
    const targetLang = (lang || "").toLowerCase();
    if (targetLang && targetLang !== currentLang) {
      logUiEvent(
        "language_change",
        `from=${currentLang} to=${targetLang} path=${window.location.pathname}`,
        "INFO",
        "ui.lang"
      );
    }

    input.value = lang;
    if (nextInput && targetLang) {
      nextInput.value = window.location.pathname.replace(/^\/(es|en)(?=\/|$)/i, `/${targetLang}`) + window.location.search;
    }
    form.submit();
  }

  function setupUserActionLogs() {
    $$("a[href*='switch=1']").forEach((link) => {
      link.addEventListener("click", () => {
        logUiEvent(
          "switch_user_click",
          `path=${window.location.pathname}`,
          "INFO",
          "ui.auth"
        );
      });
    });

    $$("form[action*='/logout/']").forEach((form) => {
      form.addEventListener("submit", () => {
        logUiEvent(
          "logout_click",
          `path=${window.location.pathname}`,
          "INFO",
          "ui.auth"
        );
      });
    });
  }

  // ---------------------------
  // Dropdown genérico
  // ---------------------------
  function setupDropdown({ button, dropdown }) {
    if (!button || !dropdown) return;

    const openClass = "is-open";

    function close() {
      dropdown.classList.remove(openClass);
      dropdown.setAttribute("aria-hidden", "true");
      button.classList.remove("is-active");
      button.setAttribute("aria-expanded", "false");
    }

    function toggle() {
      const isOpen = dropdown.classList.toggle(openClass);
      dropdown.setAttribute("aria-hidden", isOpen ? "false" : "true");
      button.classList.toggle("is-active", isOpen);
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    document.addEventListener("click", () => close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // ---------------------------
  // Select común
  // ---------------------------
  const selectState = new WeakMap();
  let openSelect = null;

  function isSelectElement(target) {
    return target && target.tagName === "SELECT";
  }

  function getSelects(target) {
    if (!target) return [];
    if (isSelectElement(target)) return [target];
    return $$("select[data-ui-select]", target);
  }

  function selectedOption(select) {
    return select.options[select.selectedIndex] || select.options[0] || null;
  }

  function closeUiSelect(select) {
    const state = select ? selectState.get(select) : null;
    if (!state) return;
    state.wrapper.classList.remove("is-open");
    state.button.setAttribute("aria-expanded", "false");
    state.menu.classList.remove("is-open");
    openSelect = openSelect === select ? null : openSelect;
  }

  function closeAllUiSelects() {
    if (openSelect) closeUiSelect(openSelect);
  }

  function positionUiSelectMenu(select) {
    const state = selectState.get(select);
    if (!state) return;

    const rect = state.button.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = Math.max(120, (openUp ? spaceAbove : spaceBelow) - gap);

    state.menu.style.left = `${Math.round(rect.left)}px`;
    state.menu.style.width = `${Math.round(rect.width)}px`;
    state.menu.style.maxHeight = `${Math.min(260, available)}px`;
    state.menu.style.top = openUp ? "auto" : `${Math.round(rect.bottom + gap)}px`;
    state.menu.style.bottom = openUp ? `${Math.round(window.innerHeight - rect.top + gap)}px` : "auto";
  }

  function syncUiSelect(select) {
    const state = selectState.get(select);
    if (!state) return;

    const option = selectedOption(select);
    const label = option ? option.textContent.trim() : (select.dataset.uiSelectPlaceholder || "Seleccionar...");
    state.value.textContent = label || select.dataset.uiSelectPlaceholder || "Seleccionar...";
    state.wrapper.classList.toggle("is-empty", !select.value && select.dataset.uiSelectEmptyValid !== "true");
    state.button.disabled = select.disabled;
    state.menu.querySelectorAll(".tpv-select__option").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.value === select.value);
      btn.setAttribute("aria-selected", btn.dataset.value === select.value ? "true" : "false");
    });
  }

  function buildUiSelectMenu(select) {
    const state = selectState.get(select);
    if (!state) return;

    state.menu.innerHTML = "";
    const options = Array.from(select.options).filter((option) => !option.hidden);

    if (options.length === 0) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "tpv-select__option";
      empty.disabled = true;
      empty.textContent = "Sin opciones";
      state.menu.appendChild(empty);
      return;
    }

    options.forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "tpv-select__option";
      item.dataset.value = option.value;
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (option.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncUiSelect(select);
        closeUiSelect(select);
        state.button.focus({ preventScroll: true });
      });
      state.menu.appendChild(item);
    });
  }

  function openUiSelect(select) {
    const state = selectState.get(select);
    if (!state || select.disabled) return;

    if (openSelect && openSelect !== select) closeUiSelect(openSelect);
    buildUiSelectMenu(select);
    syncUiSelect(select);
    positionUiSelectMenu(select);
    state.wrapper.classList.add("is-open");
    state.button.setAttribute("aria-expanded", "true");
    state.menu.classList.add("is-open");
    openSelect = select;

    const selected = state.menu.querySelector(".tpv-select__option.is-selected:not([disabled])");
    (selected || state.menu.querySelector(".tpv-select__option:not([disabled])"))?.focus({ preventScroll: true });
  }

  function toggleUiSelect(select) {
    const state = selectState.get(select);
    if (!state) return;
    if (state.wrapper.classList.contains("is-open")) {
      closeUiSelect(select);
    } else {
      openUiSelect(select);
    }
  }

  function focusUiSelectOption(menu, direction) {
    const items = $$(".tpv-select__option:not([disabled])", menu);
    if (items.length === 0) return;
    const current = document.activeElement;
    const currentIndex = items.indexOf(current);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : items.length - 1)
      : (currentIndex + direction + items.length) % items.length;
    items[nextIndex].focus({ preventScroll: true });
  }

  function enhanceUiSelect(select) {
    if (!select) return;
    if (select.dataset.uiSelectReady === "1") {
      syncUiSelect(select);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "tpv-select";
    if (select.classList.contains("input-compact-v2") || select.dataset.uiSelectSize === "compact") {
      wrapper.classList.add("tpv-select--compact");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tpv-select__button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");

    const value = document.createElement("span");
    value.className = "tpv-select__value";

    const arrow = document.createElement("span");
    arrow.className = "tpv-select__arrow";
    arrow.setAttribute("aria-hidden", "true");

    const menu = document.createElement("div");
    menu.className = "tpv-select__menu";
    menu.setAttribute("role", "listbox");

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(button);
    button.appendChild(value);
    button.appendChild(arrow);
    document.body.appendChild(menu);

    select.classList.add("tpv-select__native");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    select.dataset.uiSelectReady = "1";
    selectState.set(select, { wrapper, button, value, arrow, menu });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleUiSelect(select);
    });

    button.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openUiSelect(select);
      }
    });

    menu.addEventListener("click", (event) => event.stopPropagation());
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeUiSelect(select);
        button.focus({ preventScroll: true });
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusUiSelectOption(menu, 1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusUiSelectOption(menu, -1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        $$(".tpv-select__option:not([disabled])", menu)[0]?.focus({ preventScroll: true });
      }
      if (event.key === "End") {
        event.preventDefault();
        const items = $$(".tpv-select__option:not([disabled])", menu);
        items[items.length - 1]?.focus({ preventScroll: true });
      }
    });

    select.addEventListener("change", () => syncUiSelect(select));
    buildUiSelectMenu(select);
    syncUiSelect(select);
  }

  function initUiSelects(root = document) {
    getSelects(root).forEach(enhanceUiSelect);
  }

  function refreshUiSelects(target = document) {
    getSelects(target).forEach((select) => {
      if (select.dataset.uiSelectReady === "1") {
        buildUiSelectMenu(select);
        syncUiSelect(select);
        if (selectState.get(select)?.wrapper.classList.contains("is-open")) {
          positionUiSelectMenu(select);
        }
      } else {
        enhanceUiSelect(select);
      }
    });
  }

  document.addEventListener("click", closeAllUiSelects);
  document.addEventListener("scroll", () => {
    if (openSelect) positionUiSelectMenu(openSelect);
  }, true);
  window.addEventListener("resize", () => {
    if (openSelect) positionUiSelectMenu(openSelect);
  });

  window.TPVSelect = {
    init: initUiSelects,
    refresh: refreshUiSelects,
    sync: syncUiSelect,
    closeAll: closeAllUiSelects,
  };

  // ---------------------------
  // Sidebar (hamburguesa)
  // Nota: como usas el mismo botón para dropdown, esto se ejecuta también.
  // Si quieres separarlo en dos botones (recomendado), lo hacemos luego.
  // ---------------------------
  function setupSidebar() {
    const btnMenu = $("#btnMenu");
    const sidebar = $("#sidebar") || $(".sidebar");
    if (!btnMenu || !sidebar) return;

    btnMenu.addEventListener("click", () => {
      sidebar.classList.toggle("is-open");
    });
  }

  // ---------------------------
  // Dropdown del botón ☰ (menuDropdown)
  // ---------------------------
  function setupTopMenuDropdown() {
    const btnMenu = $("#btnMenu");
    const dropdown = $("#menuDropdown");
    if (!btnMenu || !dropdown) return;

    setupDropdown({ button: btnMenu, dropdown });

    // Tema: click + marcar seleccionado
    $$(".dropdown__item[data-set-theme]", dropdown).forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const theme = b.dataset.setTheme;
        setTheme(theme);
        markSelectedTheme(theme);
      });
    });

    // Idioma: click (el marcado del idioma ya lo hace Django con CURRENT_LANGUAGE)
    $$(".dropdown__item[data-set-lang]", dropdown).forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        setLanguage(b.dataset.setLang);
      });
    });

    // Marcar tema seleccionado al cargar
    markSelectedTheme(getSavedTheme());
  }

  // ---------------------------
  // Dropdown del usuario
  // ---------------------------
  function setupUserDropdown() {
    const btn = $("#btnUsuario");
    const dd = $("#userDropdown");
    if (!btn || !dd) return;

    setupDropdown({ button: btn, dropdown: dd });
  }

  // ---------------------------
  // Reloj
  // ---------------------------
  function startClock() {
    const els = document.querySelectorAll("#clock, .js-clock");
    if (!els || els.length === 0) return;

    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const timeStr = `${hh}:${mm}:${ss}`;
      
      els.forEach(el => {
          el.textContent = timeStr;
      });
    }

    tick();
    setInterval(tick, 1000);
  }

  // ---------------------------
  // Init
  // ---------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // Aplicar tema guardado
    const savedTheme = getSavedTheme();
    document.documentElement.setAttribute("data-theme", savedTheme);

    setupSidebar();
    setupTopMenuDropdown();
    setupUserDropdown();
    initUiSelects(document);
    setupUserActionLogs();
    startClock();

    // Registrar Service Worker para PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registrado', reg.scope))
        .catch(err => console.error('Error al registrar Service Worker', err));
    }

    // Bloquear el menú contextual (clic derecho) en toda la aplicación
    document.addEventListener('contextmenu', event => {
      // Permitir clic derecho si estamos en un campo de texto por si necesitan pegar (opcional)
      // if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
      // }
    });
  });
})();
