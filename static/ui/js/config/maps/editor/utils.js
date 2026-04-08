/* utils.js — Utilidades puras, constantes y helpers de tipo/numeración */

// ─── Selectores DOM ──────────────────────────────────────────
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ─── Utilidades generales ────────────────────────────────────
export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ─── Constantes de grid / snap ───────────────────────────────
export const GRID = 22;
export const snapToGrid = (v) => Math.round(v / GRID) * GRID;

export const SNAP_THRESHOLD = 8;
export const SNAP_OVERLAP_MIN = 18;
export const SNAP_CORNER_THRESHOLD = 8;

// ─── UID ─────────────────────────────────────────────────────
export function uid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ─── Query string ────────────────────────────────────────────
export function getQuery() {
    return new URLSearchParams(window.location.search);
}

// ─── Geometría 1-D ──────────────────────────────────────────
export function overlap1D(a1, a2, b1, b2) {
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

// ─── Tipos numerados (mesa / barra / llevar) ─────────────────
export function getTypePrefix(type) {
    if (type === "mesa_normal" || type === "mesa_grande") return "Mesa";
    if (type === "taburete") return "Barra";
    if (type === "llevar") return "Llevar";
    return null;
}

export function isNumberedType(type) {
    return !!getTypePrefix(type);
}

export function normalizeNumero(raw) {
    const s = (raw ?? "").toString().trim();
    if (!s) return null;
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return String(n);
}
