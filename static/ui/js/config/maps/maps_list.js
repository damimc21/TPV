/* maps.js (BD/API)
   Pantalla: "Tus mapas TPV"
   - Lista mapas guardados en BD (API)
   - Activar un mapa (API) y refrescar UI
   - Editar (link al editor)
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const Notify = window.Notify;

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
    return (
      document.cookie
        .split("; ")
        .find((r) => r.startsWith("csrftoken="))
        ?.split("=")[1] || ""
    );
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

  async function render() {
    const grid = $("#mapsGrid");
    if (!grid) return;

    let payload;
    try {
      payload = await apiListMaps();
    } catch (e) {
      console.error(e);
      grid.innerHTML = `
        <article class="card">
          <div class="card__icon">⚠️</div>
          <div class="card__body">
            <h2 class="card__title">Error cargando mapas</h2>
            <p class="card__desc">Revisa la consola y el endpoint /api/maps/</p>
          </div>
        </article>
      `;
      return;
    }

    const maps = payload.maps || [];
    if (!maps.length) {
      grid.innerHTML = `
        <article class="card">
          <div class="card__icon">🗂️</div>
          <div class="card__body">
            <h2 class="card__title">Aun no hay mapas</h2>
            <p class="card__desc">Crea tu primer mapa para empezar a usar el TPV por mesas.</p>
          </div>
          <div class="card__cta">
            <a href="${BASE}/config/maps/create/" style="text-decoration:none; color:inherit;">Crear →</a>
          </div>
        </article>
      `;
      return;
    }

    grid.innerHTML = maps.map((m) => {
      const isActive = Boolean(m.is_active);
      return `
        <article class="card" data-id="${escapeHtml(m.id)}">
          <div class="card__icon">${isActive ? "✅" : "🗺️"}</div>
          <div class="card__body">
            <h2 class="card__title">${escapeHtml(m.name || "Mapa sin nombre")}</h2>
            <p class="card__desc">
              ${isActive ? "Mapa activo" : "Mapa no activo"} ·
              ${Number(m.items_count || 0)} elementos
            </p>
          </div>
          <div class="card__cta" style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn--mini ${isActive ? "btn--success" : ""}" data-action="activate" ${isActive ? "disabled" : ""}>
              ${isActive ? "Activo" : "Activar"}
            </button>
            <a class="btn btn--mini" href="${BASE}/config/maps/create/?edit=${encodeURIComponent(m.id)}">Editar</a>
            <button class="btn btn--mini btn--danger" data-action="delete" ${isActive ? "disabled title='No puedes borrar el mapa activo'" : ""}>
              🗑️ Eliminar
            </button>
          </div>
        </article>
      `;
    }).join("");

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
            const name = card.querySelector(".card__title")?.textContent?.trim() || "este mapa";
            const ok = await Notify.confirmDanger(
              `¿Estas seguro de que quieres eliminar "${name}"?\nEsta accion no se puede deshacer.`,
              { title: "Eliminar mapa", variant: "danger" }
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
          await Notify.error("No se pudo completar la accion");
          btn.disabled = false;
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
