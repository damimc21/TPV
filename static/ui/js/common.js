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

  // ---------------------------
  // Tema (dark/light)
  // ---------------------------
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("tpv_theme", theme); } catch (_) { }
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

    input.value = lang;
    form.submit();
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
    }

    function toggle() {
      const isOpen = dropdown.classList.toggle(openClass);
      dropdown.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }

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