/* Shared export dropdown for Ficheros pages. */
(function () {
  "use strict";

  const WRAPPER_SELECTOR = ".fich-export";
  const TOGGLE_SELECTOR = "[data-export-toggle], .fich-export__toggle";
  const ITEM_SELECTOR = ".fich-export__item[data-export-format]";

  function getWrapper(el) {
    return el ? el.closest(WRAPPER_SELECTOR) : null;
  }

  function getEventElement(event) {
    if (!event.target) return null;
    if (event.target.nodeType === Node.ELEMENT_NODE) return event.target;
    return event.target.parentElement || null;
  }

  function clearFloatingPosition(menu) {
    menu.classList.remove("is-floating-layer");
    menu.style.position = "";
    menu.style.zIndex = "";
    menu.style.right = "";
    menu.style.bottom = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.removeProperty("--floating-left");
    menu.style.removeProperty("--floating-top");
    menu.style.removeProperty("--floating-width");
    menu.style.removeProperty("--floating-max-height");
  }

  function refreshFloatingCards() {
    document.querySelectorAll(".fich-card--export").forEach((card) => {
      const hasOpenSelect = card.querySelector(".fich-custom-select__menu:not(.hidden)");
      const hasOpenExport = card.querySelector(".fich-export__menu:not(.hidden)");
      const hasOpenMenu = hasOpenSelect || hasOpenExport;
      card.classList.toggle("is-floating-open", Boolean(hasOpenMenu));
      card.classList.toggle("is-custom-select-open", Boolean(hasOpenSelect));
      card.classList.toggle("is-export-menu-open", Boolean(hasOpenExport));
    });
  }

  function closeAll() {
    document.querySelectorAll(".fich-export__menu").forEach((menu) => {
      menu.classList.add("hidden");
      clearFloatingPosition(menu);
    });
    document.querySelectorAll(".fich-export__toggle").forEach((toggle) => {
      toggle.setAttribute("aria-expanded", "false");
    });
    refreshFloatingCards();
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const minWidth = Number.parseInt(getWrapper(anchor)?.dataset.exportMinWidth || "160", 10);
    const width = Math.max(rect.width, Number.isFinite(minWidth) ? minWidth : 160);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, rect.right - width)
    );
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const menuHeight = Math.min(menu.scrollHeight || 280, 280);
    const openUp = availableBelow < Math.min(menuHeight, 180) && rect.top > availableBelow;
    const top = openUp
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : Math.min(window.innerHeight - viewportPadding - 40, rect.bottom + gap);
    const maxHeight = openUp
      ? Math.max(160, rect.top - viewportPadding - gap)
      : Math.max(160, availableBelow);

    menu.classList.add("is-floating-layer");
    menu.style.position = "fixed";
    menu.style.zIndex = "4000";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.setProperty("--floating-left", `${left}px`);
    menu.style.setProperty("--floating-top", `${top}px`);
    menu.style.setProperty("--floating-width", `${width}px`);
    menu.style.setProperty("--floating-max-height", `${maxHeight}px`);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${maxHeight}px`;
  }

  function openMenu(wrapper, toggle) {
    const menu = wrapper.querySelector(".fich-export__menu");
    if (!menu) return;
    closeAll();
    menu.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    positionMenu(menu, toggle);
    refreshFloatingCards();
  }

  function toggleMenu(toggle, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const wrapper = getWrapper(toggle);
    if (!wrapper) return;
    const menu = wrapper.querySelector(".fich-export__menu");
    if (!menu) return;
    const willOpen = menu.classList.contains("hidden");
    if (willOpen) openMenu(wrapper, toggle);
    else closeAll();
  }

  function collectArgs(wrapper, item) {
    const args = [];
    for (let i = 1; i <= 8; i += 1) {
      const value =
        item.getAttribute(`data-export-arg-${i}`) ??
        wrapper.getAttribute(`data-export-arg-${i}`) ??
        item.getAttribute(`data-export-arg${i}`) ??
        wrapper.getAttribute(`data-export-arg${i}`);
      if (value === null) break;
      args.push(value);
    }
    return args;
  }

  function dispatchExport(item, event) {
    event.preventDefault();
    event.stopPropagation();

    const wrapper = getWrapper(item);
    if (!wrapper) return;
    const handlerName = item.dataset.exportHandler || wrapper.dataset.exportHandler;
    const handler = handlerName ? window[handlerName] : null;
    const format = item.dataset.exportFormat;
    const args = collectArgs(wrapper, item);

    closeAll();

    if (typeof handler !== "function") {
      console.error(`Export handler not found: ${handlerName || "(empty)"}`);
      return;
    }

    try {
      const result = handler(event, ...args, format);
      if (result && typeof result.catch === "function") {
        result.catch((error) => console.error(error));
      }
    } catch (error) {
      console.error(error);
    }
  }

  document.addEventListener("click", (event) => {
    const target = getEventElement(event);
    if (!target) return;

    const toggle = target.closest(TOGGLE_SELECTOR);
    if (toggle && getWrapper(toggle)) {
      toggleMenu(toggle, event);
      return;
    }

    const item = target.closest(ITEM_SELECTOR);
    if (item && getWrapper(item)) {
      dispatchExport(item, event);
      return;
    }

    if (!target.closest(WRAPPER_SELECTOR)) {
      closeAll();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });

  window.addEventListener("resize", closeAll);
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".main")?.addEventListener("scroll", closeAll, { passive: true });
  });

  window.FichExportMenu = {
    closeAll,
    toggle: toggleMenu,
    positionMenu,
    clearFloatingPosition,
    refreshFloatingCards,
  };

  window.toggleExportMenu = (event, btn) => toggleMenu(btn, event);
})();
