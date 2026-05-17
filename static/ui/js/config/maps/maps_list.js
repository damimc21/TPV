/* maps_list.js
   Pantalla de mapas guardados.
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const Notify = window.Notify;
  const gettext = typeof window.gettext === "function" ? window.gettext : (text) => text;
  const ICON_BASE = "/static/ui/img/iconos/";

  function formatText(text, values = {}) {
    return Object.entries(values).reduce(
      (current, [key, value]) => current.replace(new RegExp(`%\\(${key}\\)s`, "g"), String(value)),
      gettext(text)
    );
  }

  function icon(name) {
    return `<img src="${ICON_BASE}${name}.svg" class="svg-icon" width="24" alt="">`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function basePath() {
    const m = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
    return m ? `/${m[1]}` : "";
  }

  const BASE = basePath();

  function getCSRFToken() {
    return window.TpvUtils ? window.TpvUtils.getCSRFToken() : "";
  }

  async function apiListMaps() {
    const res = await fetch(`${BASE}/api/maps/`, { method: "GET" });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  async function apiActivateMap(mapId) {
    const res = await fetch(`${BASE}/api/maps/${mapId}/activate/`, {
      method: "POST",
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  async function apiDeleteMap(mapId) {
    const res = await fetch(`${BASE}/api/maps/${mapId}/delete/`, {
      method: "POST",
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }

  function renderError(grid) {
    grid.innerHTML = `
      <article class="card">
        <div class="card__icon">${icon("circle-alert")}</div>
        <div class="card__body">
          <h2 class="card__title">${gettext("Error cargando mapas")}</h2>
          <p class="card__desc">${gettext("Revisa la consola y el endpoint /api/maps/")}</p>
        </div>
      </article>
    `;
  }

  function renderEmpty(grid) {
    grid.innerHTML = `
      <article class="card">
        <div class="card__icon">${icon("map-plus")}</div>
        <div class="card__body">
          <h2 class="card__title">${gettext("Aún no hay mapas")}</h2>
          <p class="card__desc">${gettext("Crea tu primer mapa para empezar a usar el TPV por mesas.")}</p>
        </div>
        <div class="card__cta">
          <a href="${BASE}/config/maps/create/" style="text-decoration:none; color:inherit;">${gettext("Crear")}</a>
        </div>
      </article>
    `;
  }

  function renderCards(grid, maps) {
    grid.innerHTML = maps.map((m) => {
      const isActive = Boolean(m.is_active);
      const count = Number(m.items_count || 0);
      const countText = count === 1
        ? gettext("1 elemento")
        : formatText("%(count)s elementos", { count });

      return `
        <article class="card" data-id="${escapeHtml(m.id)}">
          <div class="card__icon">${icon(isActive ? "check" : "map")}</div>
          <div class="card__body">
            <h2 class="card__title">${escapeHtml(m.name || gettext("Mapa sin nombre"))}</h2>
            <p class="card__desc">
              ${isActive ? gettext("Mapa activo") : gettext("Mapa no activo")} ·
              ${countText}
            </p>
          </div>
          <div class="card__cta" style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn--mini ${isActive ? "btn--success" : ""}" data-action="activate" ${isActive ? "disabled" : ""}>
              ${isActive ? gettext("Activo") : gettext("Activar")}
            </button>
            <a class="btn btn--mini" href="${BASE}/config/maps/create/?id=${encodeURIComponent(m.id)}">${gettext("Editar")}</a>
            <button class="btn btn--mini btn--danger" data-action="delete" ${isActive ? `disabled title="${escapeHtml(gettext("No puedes borrar el mapa activo"))}"` : ""}>
              ${icon("trash-2")} ${gettext("Eliminar")}
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function render() {
    const grid = $("#mapsGrid");
    if (!grid) return;

    let payload;
    try {
      payload = await apiListMaps();
    } catch (e) {
      console.error(e);
      renderError(grid);
      return;
    }

    const maps = payload.maps || [];
    if (!maps.length) {
      renderEmpty(grid);
      return;
    }

    renderCards(grid, maps);

    grid.querySelectorAll(".card[data-id]").forEach((card) => {
      const id = card.getAttribute("data-id");

      card.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const action = btn.getAttribute("data-action");
        try {
          btn.disabled = true;

          if (action === "activate") {
            await apiActivateMap(id);
            await render();
            return;
          }

          if (action === "delete") {
            const name = card.querySelector(".card__title")?.textContent?.trim() || gettext("este mapa");
            const ok = await Notify.confirmDanger(
              formatText("¿Seguro que quieres eliminar \"%(name)s\"? Esta acción no se puede deshacer.", { name }),
              {
                title: gettext("Eliminar mapa"),
                okText: gettext("Eliminar"),
                cancelText: gettext("Cancelar"),
                variant: "danger",
              }
            );
            if (!ok) {
              btn.disabled = false;
              return;
            }

            await apiDeleteMap(id);
            await render();
            return;
          }

          btn.disabled = false;
        } catch (err) {
          console.error(err);
          await Notify.error(gettext("No se pudo completar la acción"));
          btn.disabled = false;
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
