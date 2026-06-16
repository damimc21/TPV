/* geometry.js — AABB, tamaños de items y transformaciones de coordenadas */

// ─── Tipos redimensionables (decoración libre) ────────────────
export const RESIZABLE_TYPES = new Set([
    "barra", "planta",
    "columna", "cristal_fino", "cristal_gordo", "esquina_muro",
    "lavamanos", "maceton", "muro", "papelera", "puerta", "wc",
]);

// ─── Tamaños base de cada tipo de item ───────────────────────
export function getItemBaseSize(type) {
    switch (type) {
        case "mesa_normal": return { w: 70, h: 70 };
        case "mesa_grande": return { w: 140, h: 70 };
        case "taburete": return { w: 54, h: 54 };
        case "llevar": return { w: 58, h: 58 };
        case "planta": return { w: 35, h: 35 };
        case "barra": return { w: 40, h: 200 };
        case "columna": return { w: 42, h: 41 };
        case "cristal_fino": return { w: 13, h: 210 };
        case "cristal_gordo": return { w: 42, h: 210 };
        case "esquina_muro": return { w: 56, h: 50 };
        case "lavamanos": return { w: 45, h: 130 };
        case "maceton": return { w: 45, h: 160 };
        case "muro": return { w: 220, h: 40 };
        case "papelera": return { w: 40, h: 35 };
        case "puerta": return { w: 70, h: 67 };
        case "wc": return { w: 50, h: 85 };
        default: return { w: 70, h: 70 };
    }
}

// ─── Tamaño efectivo (base o personalizado) ──────────────────
// Devuelve unidades base (sin escala de mapa)
export function getEffectiveSize(item) {
    const base = getItemBaseSize(item.type);
    return {
        w: item.data?.w ?? base.w,
        h: item.data?.h ?? base.h,
    };
}

// ─── Escala de items según resolución del mapa ───────────────
export function getMapItemScale(map) {
    const Wref = 1920;
    const Href = 1080;

    const w = Number(map?.width) || Wref;
    const h = Number(map?.height) || Href;

    const sx = w / Wref;
    const sy = h / Href;

    let s = Math.min(sx, sy);
    s = Math.max(0.5, Math.min(2.5, s));
    return s;
}

export function getItemSize(type, map) {
    const b = getItemBaseSize(type);
    const s = getMapItemScale(map);
    return { w: b.w * s, h: b.h * s };
}

// Igual que getItemSize pero respetando tamaño personalizado del item
export function getEffectiveItemSize(item, map) {
    const b = getEffectiveSize(item);
    const s = getMapItemScale(map);
    return { w: b.w * s, h: b.h * s };
}

// ─── Rotación normalizada ────────────────────────────────────
export function normRot(it) {
    const rot = Number(it.rotation);
    const r = Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : 0;
    return r;
}

// ─── AABB real (teniendo en cuenta rotación 90/180/270) ──────
export function getAABB(it, map, x = it.x, y = it.y) {
    const base = getEffectiveItemSize(it, map);
    const r = normRot(it);

    const W0 = base.w;
    const H0 = base.h;

    const swap = r === 90 || r === 270;
    const W = swap ? H0 : W0;
    const H = swap ? W0 : H0;

    const shiftX = (W0 - W) / 2;
    const shiftY = (H0 - H) / 2;

    const left = x + shiftX;
    const top = y + shiftY;

    return {
        left,
        top,
        right: left + W,
        bottom: top + H,
        w: W,
        h: H,
        shiftX,
        shiftY,
        baseW: W0,
        baseH: H0,
        rot: r,
    };
}

// ─── Convertir left/top visual (AABB) → x/y lógico ──────────
export function xFromAABBLeft(it, aabbLeft, map) {
    const base = getEffectiveItemSize(it, map);
    const r = normRot(it);
    const swap = r === 90 || r === 270;
    const W = swap ? base.h : base.w;
    const shiftX = (base.w - W) / 2;
    return aabbLeft - shiftX;
}

export function yFromAABBTop(it, aabbTop, map) {
    const base = getEffectiveItemSize(it, map);
    const r = normRot(it);
    const swap = r === 90 || r === 270;
    const H = swap ? base.w : base.h;
    const shiftY = (base.h - H) / 2;
    return aabbTop - shiftY;
}

// ─── Coordenadas mundo ← evento de ratón ─────────────────────
export function worldPointFromEvent(e, canvas, camera) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const x = (sx - camera.panX) / camera.zoom;
    const y = (sy - camera.panY) / camera.zoom;
    return { x, y };
}

// ─── Rectángulos normalizados ────────────────────────────────
export function normRect(r) {
    const x = Math.min(r.x1, r.x2);
    const y = Math.min(r.y1, r.y2);
    const w = Math.abs(r.x2 - r.x1);
    const h = Math.abs(r.y2 - r.y1);
    return { x, y, w, h };
}

export function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
