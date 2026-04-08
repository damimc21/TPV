/* geometry.js — AABB, tamaños de items y transformaciones de coordenadas */

// ─── Tamaños base de cada tipo de item ───────────────────────
export function getItemBaseSize(type) {
    switch (type) {
        case "mesa_normal": return { w: 70, h: 70 };
        case "mesa_grande": return { w: 140, h: 70 };
        case "taburete": return { w: 54, h: 54 };
        case "llevar": return { w: 58, h: 58 };
        case "planta": return { w: 35, h: 35 };
        default: return { w: 70, h: 70 };
    }
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

// ─── Rotación normalizada ────────────────────────────────────
export function normRot(it) {
    const rot = Number(it.rotation);
    const r = Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : 0;
    return r;
}

// ─── AABB real (teniendo en cuenta rotación 90/180/270) ──────
export function getAABB(it, map, x = it.x, y = it.y) {
    const base = getItemSize(it.type, map);
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
    const base = getItemSize(it.type, map);
    const r = normRot(it);
    const swap = r === 90 || r === 270;
    const W = swap ? base.h : base.w;
    const shiftX = (base.w - W) / 2;
    return aabbLeft - shiftX;
}

export function yFromAABBTop(it, aabbTop, map) {
    const base = getItemSize(it.type, map);
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
