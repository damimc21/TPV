/* api.js — Persistencia en Django (CSRF + endpoints) */

// ─── CSRF ────────────────────────────────────────────────────
// Delegado en window.TpvUtils (definido en common/utils.js).
export function getCSRFToken() {
    return (typeof window !== "undefined" && window.TpvUtils)
        ? window.TpvUtils.getCSRFToken()
        : "";
}

// ─── Base path (detecta /es/ o /en/ etc) ─────────────────────
export function basePath() {
    const m = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
    return m ? `/${m[1]}` : "";
}

const BASE = basePath();

// ─── API de mapas ────────────────────────────────────────────
export async function apiSaveMap(payload, mapId = 0) {
    const res = await fetch(`${BASE}/api/maps/${mapId}/save/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

export async function apiLoadMap(mapId) {
    const res = await fetch(`${BASE}/api/maps/${mapId}/`);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

export async function apiListMaps() {
    const res = await fetch(`${BASE}/api/maps/`, { method: "GET" });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

export async function apiDeleteMap(mapId) {
    const res = await fetch(`${BASE}/api/maps/${mapId}/`, {
        method: "DELETE",
        headers: { "X-CSRFToken": getCSRFToken() },
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
}
