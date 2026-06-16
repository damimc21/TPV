/* map_editor.js â€” MÃ³dulo principal del editor de mapas TPV
   
   MÃ³dulo de entrada (ES module). Importa la lÃ³gica pura de:
   - utils.js     â†’ helpers, constantes, tipos
   - api.js       â†’ persistencia Django
   - geometry.js  â†’ AABB, tamaÃ±os, coordenadas
   - snapping.js  â†’ magnetismo corregido
*/

import {
    $, $$, clamp, snapToGrid, uid, getQuery, overlap1D,
    GRID, SNAP_THRESHOLD, getTypePrefix, isNumberedType, normalizeNumero
} from './utils.js';
import { apiSaveMap, apiLoadMap, apiListMaps, apiDeleteMap } from './api.js';
import {
    getMapItemScale, getItemBaseSize, getItemSize, getEffectiveItemSize,
    getEffectiveSize, RESIZABLE_TYPES, normRot, getAABB,
    xFromAABBLeft, yFromAABBTop, worldPointFromEvent, normRect, rectsIntersect
} from './geometry.js';
import { computeSnap } from './snapping.js';
import { showPrompt } from './modal.js';
import {
    MAP_SKINS,
    getItemSkin,
    isTouchPointer,
    mapSkinUrl,
    preventTouchGesture,
    touchDistance,
    touchMidpoint,
    worldPointFromClient,
} from './interaction_helpers.js';
import { copySelectedItems, duplicateItems, pasteItems } from './clipboard_ops.js';
import { showContextMenu } from './context_menu.js';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DOM / Config
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const canvas = $("#canvas");
const world = $("#world");
const canvasWrap = canvas?.closest(".editor__canvasWrap") || canvas;
const mapName = $("#mapName");
const saveState = $("#saveState");

const btnSave = $("#btnSave");
const btnDeleteMap = $("#btnDeleteMap");
const btnBack = $("#btnBack");

const btnRotateL = $("#btnRotateL");
const btnRotateR = $("#btnRotateR");
const btnDelete = $("#btnDelete");
const btnNameCancel = $("#btnNameCancel");
const btnEditNumber = $("#btnEditNumber");
const resolutionSelect = $("#mapResolution");

const mapPicker = $("#mapPicker");
const pickerDrop = $("#pickerDrop");
const btnNewMap = $("#btnNewMap");

const cfgEl = $("#map-editor-config");
const CFG = cfgEl
    ? JSON.parse(cfgEl.textContent)
    : { mapsListUrl: "/config/maps/", editorUrl: "/config/maps/create/" };
const Notify = window.Notify;
const gettext = typeof window.gettext === "function" ? window.gettext : (text) => text;

function formatText(text, values = {}) {
    return Object.entries(values).reduce(
        (current, [key, value]) => current.replace(new RegExp(`%\\(${key}\\)s`, "g"), String(value)),
        gettext(text)
    );
}

// Seguridad: si se carga en una pÃ¡gina sin editor, no hacemos nada
if (!canvas || !world || !mapName) {
    throw new Error("map_editor: elementos DOM no encontrados, abortando.");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Estado del editor
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let map = null;
let selectedIds = new Set();
let currentFloor = "dark";

// ── Suelo (scope de módulo para que loadMap pueda llamarla) ──────────────────
function applyFloor(floor) {
    currentFloor = floor ?? "";

    // Sincronizar picker: label + preview
    const pickerLabel   = document.getElementById("floorPickerLabel");
    const pickerPreview = document.getElementById("floorPickerPreview");
    const activeItem    = document.querySelector(`.floorDrop__item[data-floor="${currentFloor}"]`);

    if (pickerLabel && activeItem) {
        pickerLabel.textContent = activeItem.querySelector("span:last-child")?.textContent ?? "";
    }
    if (pickerPreview && activeItem) {
        const itemPreview = activeItem.querySelector(".floorBtn__preview");
        pickerPreview.style.cssText = itemPreview ? itemPreview.style.cssText : "";
    }

    // Marcar item activo en el drop
    document.querySelectorAll(".floorDrop__item").forEach((item) => {
        item.classList.toggle("is-current", item.dataset.floor === currentFloor);
    });

    // Aplicar clase al world
    const world = document.getElementById("world");
    if (world) {
        world.className = world.className.replace(/\bfloor--\S+/g, "").trim();
        if (currentFloor) world.classList.add(`floor--${currentFloor}`);
    }
}

// Undo/Redo
let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// Modos: pan / select (space invierte temporalmente)
let panMode = false;
let spaceDown = false;
let placementTool = null;

// Interacciones
let dragging = null;
let resizing = null;
let marquee = null;
let marqueeBaseSelection = null;
let marqueeEl = null;
let suppressNextCanvasClick = false;
let suppressNextItemClick = false;

// Clipboard (copia interna de items para pegar)
let clipboard = [];

// PosiciÃ³n del ratÃ³n en coordenadas mundo (para pegar en cursor)
let lastWorldMouse = { x: 0, y: 0 };

// MenÃº contextual

// GuÃ­as de alineaciÃ³n (pool dinÃ¡mico)
let guideEls = [];  // pool de elementos guÃ­a reutilizables

// Estado del nombre
let savedName = "";

// Estado guardado / cambios
let hasSaved = false;
let savedSnapshot = "";
let syncingResolutionSelect = false;

function syncResolutionControl(w = 1920, h = 1080) {
    if (!resolutionSelect) return;
    syncingResolutionSelect = true;
    resolutionSelect.value = `${w}x${h}`;
    resolutionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    syncingResolutionSelect = false;
}

// Pan
let panning = null;
const activeTouchPointers = new Map();
let pinchGesture = null;

// CÃ¡mara
let minZoom = 0.2;
const maxZoom = 3;

const camera = { zoom: 1, panX: 0, panY: 0 };

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Snapshot / Dirty / UI contextual
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function computeSnapshot() {
    const name = (mapName.value || "").trim();
    const settings = {
        width: Number(map?.width || 0),
        height: Number(map?.height || 0),
    };
    const items = (map?.items || [])
        .map((it) => ({
            id: it.id, type: it.type,
            x: Math.round(it.x || 0), y: Math.round(it.y || 0),
            rotation: it.rotation || 0, data: it.data || {},
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify({ name, settings, items });
}

function pushHistory() {
    if (!map) return;
    const snapshot = JSON.stringify(map);
    if (historyStack.length && historyStack[historyStack.length - 1] === snapshot) return;
    historyStack.push(snapshot);
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    redoStack = [];
}

function undo() {
    if (historyStack.length === 0) return;
    redoStack.push(JSON.stringify(map));
    map = JSON.parse(historyStack.pop());
    render();
    afterAnyChange();
}

function redo() {
    if (redoStack.length === 0) return;
    historyStack.push(JSON.stringify(map));
    map = JSON.parse(redoStack.pop());
    render();
    afterAnyChange();
}

function hasChanges() {
    if (!map) return false;
    if (!hasSaved) {
        const name = (mapName.value || "").trim();
        return name.length > 0 || (map.items && map.items.length > 0);
    }
    return computeSnapshot() !== savedSnapshot;
}

function updateNameCancel() {
    if (!btnNameCancel) return;
    if (mapName.value !== savedName) {
        btnNameCancel.classList.remove("hidden");
    } else {
        btnNameCancel.classList.add("hidden");
    }
}

function updateSaveUI() {
    if (!btnSave || !saveState) return;
    const nameOk = mapName.value.trim().length > 0;
    const dirty = hasChanges();

    btnSave.disabled = !(nameOk && dirty);
    if (btnDeleteMap) btnDeleteMap.disabled = !hasSaved;

    if (!nameOk) {
        saveState.textContent = `• ${gettext("Sin nombre")}`;
        saveState.style.color = "rgba(255,255,255,.6)";
        return;
    }
    if (dirty) {
        saveState.textContent = `• ${gettext("Sin guardar")}`;
        saveState.style.color = "rgba(255,210,90,.9)";
        return;
    }
    saveState.textContent = `✓ ${gettext("Guardado")}`;
    saveState.style.color = "rgba(120,255,160,.9)";
}

function flashSaved() {
    if (!btnSave) return;
    btnSave.classList.add("iconAction--saved");
    window.setTimeout(() => btnSave.classList.remove("iconAction--saved"), 600);
}

function afterAnyChange() {
    updateNameCancel();
    updateSaveUI();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CÃ¡mara / Pan / Zoom
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clampCamera() {
    const vp = canvas.getBoundingClientRect();
    const worldW = (map.width || 1920) * camera.zoom;
    const worldH = (map.height || 1080) * camera.zoom;

    if (worldW <= vp.width) camera.panX = (vp.width - worldW) / 2;
    else {
        const minX = vp.width - worldW;
        camera.panX = Math.min(0, Math.max(minX, camera.panX));
    }

    if (worldH <= vp.height) camera.panY = (vp.height - worldH) / 2;
    else {
        const minY = vp.height - worldH;
        camera.panY = Math.min(0, Math.max(minY, camera.panY));
    }
}

function applyCamera() {
    world.style.transform = `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`;
}

function cancelCanvasGesture(pointerId = null) {
    activeTouchPointers.forEach((_, id) => {
        try { canvas.releasePointerCapture(id); } catch { /* noop */ }
        try { canvasWrap?.releasePointerCapture(id); } catch { /* noop */ }
    });
    if (panning && pointerId !== null) {
        try { canvas.releasePointerCapture(pointerId); } catch { /* noop */ }
        try { canvasWrap?.releasePointerCapture(pointerId); } catch { /* noop */ }
    }
    panning = null;
    canvas.classList.remove("is-panning");

    if (marquee) {
        if (pointerId !== null) {
            try { canvas.releasePointerCapture(pointerId); } catch { /* noop */ }
            try { canvasWrap?.releasePointerCapture(pointerId); } catch { /* noop */ }
        }
        marquee = null;
        marqueeBaseSelection = null;
        hideMarquee();
    }

    dragging = null;
    hideGuides();
}

function beginPinchGesture() {
    if (activeTouchPointers.size < 2) return false;
    const [a, b] = Array.from(activeTouchPointers.values()).slice(0, 2);
    const distance = touchDistance(a, b);
    if (distance < 8) return false;

    const midpoint = touchMidpoint(a, b);
    pinchGesture = {
        startDistance: distance,
        startZoom: camera.zoom,
        worldMidpoint: worldPointFromClient(midpoint.clientX, midpoint.clientY, canvas, camera),
    };
    cancelCanvasGesture();
    canvas.classList.add("is-pinching");
    return true;
}

function updatePinchGesture() {
    if (!pinchGesture || activeTouchPointers.size < 2) return;
    const [a, b] = Array.from(activeTouchPointers.values()).slice(0, 2);
    const distance = touchDistance(a, b);
    if (distance < 8) return;

    const midpoint = touchMidpoint(a, b);
    const rect = canvas.getBoundingClientRect();
    const nextZoom = clamp(pinchGesture.startZoom * (distance / pinchGesture.startDistance), minZoom, maxZoom);

    camera.zoom = nextZoom;
    camera.panX = (midpoint.clientX - rect.left) - pinchGesture.worldMidpoint.x * camera.zoom;
    camera.panY = (midpoint.clientY - rect.top) - pinchGesture.worldMidpoint.y * camera.zoom;
    clampCamera();
    applyCamera();
}

function endTouchPointer(pointerId) {
    try { canvas.releasePointerCapture(pointerId); } catch { /* noop */ }
    try { canvasWrap?.releasePointerCapture(pointerId); } catch { /* noop */ }
    activeTouchPointers.delete(pointerId);
    if (activeTouchPointers.size < 2) {
        pinchGesture = null;
        canvas.classList.remove("is-pinching");
    } else {
        beginPinchGesture();
    }
}

function setWorldSize() {
    world.style.width = (map.width || 1920) + "px";
    world.style.height = (map.height || 1080) + "px";
}

function applyItemScale() {
    world.style.setProperty("--itemScale", String(getMapItemScale(map)));
}

function fitToScreen() {
    const vp = canvas.getBoundingClientRect();
    const margin = 40;
    const zx = (vp.width - margin) / map.width;
    const zy = (vp.height - margin) / map.height;

    camera.zoom = Math.max(0.2, Math.min(2, Math.min(zx, zy)));
    camera.panX = (vp.width - map.width * camera.zoom) / 2;
    camera.panY = (vp.height - map.height * camera.zoom) / 2;

    clampCamera();
    applyCamera();
    minZoom = camera.zoom;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Marquee + GuÃ­as
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ensureMarqueeEl() {
    if (marqueeEl && marqueeEl.isConnected) return marqueeEl;
    marqueeEl = document.createElement("div");
    marqueeEl.className = "marquee";
    world.appendChild(marqueeEl);
    return marqueeEl;
}

function drawMarquee(r) {
    const box = normRect(r);
    const el = ensureMarqueeEl();
    el.style.left = box.x + "px";
    el.style.top = box.y + "px";
    el.style.width = box.w + "px";
    el.style.height = box.h + "px";
    el.classList.remove("hidden");
}

function hideMarquee() {
    if (!marqueeEl) return;
    marqueeEl.classList.add("hidden");
    marqueeEl.style.width = "0px";
    marqueeEl.style.height = "0px";
}

function hideGuides() {
    for (const el of guideEls) el.classList.add("hidden");
}

function showGuides(guidesX, guidesY) {
    const total = guidesX.length + guidesY.length;

    // Ampliar pool si hace falta
    while (guideEls.length < total) {
        const el = document.createElement("div");
        el.classList.add("hidden");
        world.appendChild(el);
        guideEls.push(el);
    }

    // Ocultar todas primero
    hideGuides();

    let idx = 0;

    // GuÃ­as verticales (eje X)
    for (const pos of guidesX) {
        const el = guideEls[idx++];
        el.className = "align-guide-x";
        el.style.left = pos + "px";
        el.style.top = "";
        el.classList.remove("hidden");
    }

    // GuÃ­as horizontales (eje Y)
    for (const pos of guidesY) {
        const el = guideEls[idx++];
        el.className = "align-guide-y";
        el.style.top = pos + "px";
        el.style.left = "";
        el.classList.remove("hidden");
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NumeraciÃ³n
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function isNumeroUsed(prefix, numero, excludeId = null) {
    const num = String(numero);
    return (map.items || []).some((it) => {
        if (excludeId && it.id === excludeId) return false;
        if (getTypePrefix(it.type) !== prefix) return false;
        const d = it.data || {};
        const nums = [d.numero].filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
        return nums.some((v) => String(v) === num);
    });
}

/** Devuelve el siguiente nÃºmero libre para un prefijo, a partir de los items actuales */
function nextFreeNumero(prefix) {
    const used = new Set();
    for (const it of (map.items || [])) {
        if (getTypePrefix(it.type) !== prefix) continue;
        const n = it.data?.numero;
        if (n !== undefined && n !== null) used.add(Number(n));
    }
    let num = 1;
    while (used.has(num)) num++;
    return num;
}

// Override: validacion por prompt comun (solo digitos, 1..999, sin aviso de entero).
async function askNumeroRequired(prefix, current = "", opts = {}) {
    const { excludeId = null, reserved = [] } = opts;
    while (true) {
        const r = await showPrompt(formatText("Número para %(prefix)s", { prefix }), current, {
            title: formatText("Número %(prefix)s", { prefix }),
            placeholder: gettext("1-999"),
            digitsOnly: true,
            minValue: 1,
            maxValue: 999,
            maxLength: 3,
            required: true,
        });
        if (r === null) return null;
        const n = normalizeNumero(r);
        if (!n) continue;
        if (reserved.map(String).includes(String(n))) {
            await Notify.info(gettext("Ese número ya está usado en esta selección. Elige otro."));
            continue;
        }
        if (isNumeroUsed(prefix, n, excludeId)) {
            await Notify.info(formatText("%(prefix)s %(number)s ya existe. Elige otro.", { prefix, number: n }));
            continue;
        }
        return n;
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SelecciÃ³n
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getItemById(id) {
    return (map?.items || []).find((it) => it.id === id);
}

function updateSelectionUI() {
    $$(".mapItem", world).forEach((el) => {
        el.classList.toggle("is-selected", selectedIds.has(el.dataset.id));
    });

    const has = selectedIds.size > 0;
    if (btnRotateL) btnRotateL.disabled = !has;
    if (btnRotateR) btnRotateR.disabled = !has;
    if (btnDelete) btnDelete.disabled = !has;

    if (btnEditNumber) {
        const can = selectedIds.size === 1 && (() => {
            const it = getItemById([...selectedIds][0]);
            return it && isNumberedType(it.type);
        })();
        btnEditNumber.disabled = !can;
    }
}

function clearSelection() {
    selectedIds.clear();
    updateSelectionUI();
}

function setSingleSelection(id) {
    selectedIds.clear();
    if (id) selectedIds.add(id);
    updateSelectionUI();
}

function toggleSelection(id) {
    if (!id) return;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateSelectionUI();
}

function updateMarqueeSelection() {
    if (!marquee) return;

    const box = normRect(marquee);
    selectedIds.clear();

    if (marquee.additive && marqueeBaseSelection) {
        marqueeBaseSelection.forEach((id) => selectedIds.add(id));
    }

    (map.items || []).forEach((it) => {
        const a = getAABB(it, map, it.x, it.y);
        const r = { x: a.left, y: a.top, w: a.w, h: a.h };
        if (rectsIntersect(box, r)) selectedIds.add(it.id);
    });

    updateSelectionUI();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Render
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderItemLabel(el, item) {
    const lab = el?.querySelector(".item__label");
    if (!lab) return;
    const prefix = getTypePrefix(item.type);
    if (!prefix) {
        lab.textContent = "";
        lab.innerHTML = "";
        lab.classList.remove("item__label--split", "is-horiz", "is-vert");
        return;
    }
    lab.classList.remove("item__label--split", "is-horiz", "is-vert");
    lab.innerHTML = "";
    lab.textContent = String(item.data?.numero ?? "").trim();
}

// Cache de URLs "blob:" con preserveAspectRatio forzado a "none", por nombre de fichero.
// Las imÃ¡genes SVG, al usarse como <img>, respetan su propio preserveAspectRatio
// interno (por defecto "xMidYMid meet") INCLUSO con object-fit:fill en el <img>,
// asÃ­ que un resize no proporcional (manejadores laterales) deja la silueta intacta
// y solo agranda el "hueco" alrededor. Para permitir que la imagen se deforme/estire
// igual que el contenedor, se reescribe el SVG en memoria forzando
// preserveAspectRatio="none" antes de usarlo como src (sin tocar el fichero original).
const _stretchableSkinCache = new Map();

function getStretchableSkinUrl(fileName) {
    if (_stretchableSkinCache.has(fileName)) return _stretchableSkinCache.get(fileName);

    const fallbackUrl = mapSkinUrl(fileName);
    const promise = fetch(fallbackUrl)
        .then((res) => {
            if (!res.ok) throw new Error("fetch failed");
            return res.text();
        })
        .then((svgText) => {
            let fixed;
            if (/preserveAspectRatio\s*=/.test(svgText)) {
                fixed = svgText.replace(/preserveAspectRatio\s*=\s*"[^"]*"/, 'preserveAspectRatio="none"');
            } else {
                fixed = svgText.replace(/<svg\b/, '<svg preserveAspectRatio="none"');
            }
            const blob = new Blob([fixed], { type: "image/svg+xml" });
            return URL.createObjectURL(blob);
        })
        .catch(() => fallbackUrl);

    _stretchableSkinCache.set(fileName, promise);
    return promise;
}

function renderItemSkin(el, item) {
    const current = el.querySelector(".item__skin");
    if (current) current.remove();
    el.classList.remove("has-skin", "has-skin-error");

    const skin = getItemSkin(item);
    const fileName = MAP_SKINS[item.type]?.[skin];
    if (!fileName) return;

    const img = document.createElement("img");
    img.className = "item__skin";
    img.alt = "";
    img.draggable = false;
    img.addEventListener("load", () => {
        el.classList.add("has-skin");
        el.classList.remove("has-skin-error");
    }, { once: true });
    img.addEventListener("error", () => {
        img.remove();
        el.classList.remove("has-skin");
        el.classList.add("has-skin-error");
    }, { once: true });

    const isSvg = /\.svg$/i.test(fileName);
    if (isSvg && RESIZABLE_TYPES.has(item.type)) {
        // Solo los tipos redimensionables libremente necesitan poder deformarse;
        // para el resto el aspecto del contenedor coincide con el de la imagen.
        getStretchableSkinUrl(fileName).then((url) => {
            img.src = url;
        });
    } else {
        img.src = mapSkinUrl(fileName);
    }
    el.prepend(img);
}

const RESIZE_HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const RESIZE_CURSOR = {
    n: "ns-resize", s: "ns-resize",
    e: "ew-resize", w: "ew-resize",
    ne: "nesw-resize", sw: "nesw-resize",
    nw: "nwse-resize", se: "nwse-resize",
};

function addResizeHandles(el, item) {
    RESIZE_HANDLES.forEach((handle) => {
        const h = document.createElement("div");
        h.className = `resize-handle resize-handle--${handle}`;
        h.style.cursor = RESIZE_CURSOR[handle];
        h.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();

            const s = getMapItemScale(map);
            const eff = getEffectiveSize(item);
            const startW = eff.w * s;
            const startH = eff.h * s;
            const rot = ((Number(item.rotation) % 360) + 360) % 360;
            const rad = (rot * Math.PI) / 180;

            pushHistory();
            h.setPointerCapture(e.pointerId);

            const p0 = worldPointFromEvent(e, canvas, camera);
            resizing = {
                id: item.id,
                handle,
                startW, startH,
                startX: item.x, startY: item.y,
                startCX: item.x + startW / 2,
                startCY: item.y + startH / 2,
                startMX: p0.x, startMY: p0.y,
                cos: Math.cos(rad), sin: Math.sin(rad),
                scale: s,
            };

            const onMove = (ev) => {
                if (!resizing) return;
                const p = worldPointFromEvent(ev, canvas, camera);
                const dx = p.x - resizing.startMX;
                const dy = p.y - resizing.startMY;

                const { cos, sin, startW: sw, startH: sh,
                        startCX, startCY, handle: hnd } = resizing;

                // Proyectar delta al espacio local del item
                const ldx = dx * cos + dy * sin;
                const ldy = -dx * sin + dy * cos;

                const MIN = 10;
                const isCorner = hnd.length === 2;
                let newW = sw, newH = sh;
                let anchorLX = 0, anchorLY = 0;
                let newAnchorLX = 0, newAnchorLY = 0;

                if (isCorner) {
                    // Resize proporcional de esquina
                    const sX = hnd.includes("e") ? 1 : -1;
                    const sY = hnd.includes("s") ? 1 : -1;
                    const diag = Math.sqrt(sw * sw + sh * sh);
                    const proj = (sX * ldx * sw + sY * ldy * sh) / diag;
                    const scale = Math.max(MIN / Math.min(sw, sh), 1 + 2 * proj / diag);
                    newW = sw * scale;
                    newH = sh * scale;
                    anchorLX = -sX * sw / 2;   anchorLY = -sY * sh / 2;
                    newAnchorLX = -sX * newW / 2; newAnchorLY = -sY * newH / 2;
                } else {
                    if (hnd === "e") {
                        newW = Math.max(MIN, sw + ldx);
                        anchorLX = -sw / 2;    newAnchorLX = -newW / 2;
                    } else if (hnd === "w") {
                        newW = Math.max(MIN, sw - ldx);
                        anchorLX = sw / 2;     newAnchorLX = newW / 2;
                    } else if (hnd === "s") {
                        newH = Math.max(MIN, sh + ldy);
                        anchorLY = -sh / 2;    newAnchorLY = -newH / 2;
                    } else { // n
                        newH = Math.max(MIN, sh - ldy);
                        anchorLY = sh / 2;     newAnchorLY = newH / 2;
                    }
                }

                // Punto ancla en espacio mundo (fijo durante el resize)
                const aWX = startCX + anchorLX * cos - anchorLY * sin;
                const aWY = startCY + anchorLX * sin + anchorLY * cos;

                // Nuevo centro a partir del ancla
                const newCX = aWX - newAnchorLX * cos + newAnchorLY * sin;
                const newCY = aWY - newAnchorLX * sin - newAnchorLY * cos;

                const finalX = Math.round(newCX - newW / 2);
                const finalY = Math.round(newCY - newH / 2);
                const finalW = Math.round(newW);
                const finalH = Math.round(newH);

                // Guardar en base units (sin escala de mapa)
                const sc = resizing.scale;
                item.data = item.data || {};
                item.data.w = Math.round(finalW / sc);
                item.data.h = Math.round(finalH / sc);
                item.x = finalX;
                item.y = finalY;

                // Actualizar DOM directamente
                el.style.left   = finalX + "px";
                el.style.top    = finalY + "px";
                el.style.width  = finalW + "px";
                el.style.height = finalH + "px";
            };

            const onUp = () => {
                resizing = null;
                h.removeEventListener("pointermove", onMove);
                h.removeEventListener("pointerup", onUp);
                h.removeEventListener("pointercancel", onUp);
                afterAnyChange();
            };

            h.addEventListener("pointermove", onMove);
            h.addEventListener("pointerup", onUp);
            h.addEventListener("pointercancel", onUp);
        });
        el.appendChild(h);
    });
}

function createItemElement(item) {
    const el = document.createElement("div");
    el.className = `mapItem item--${item.type}`;
    el.dataset.id = item.id;
    el.style.left = item.x + "px";
    el.style.top = item.y + "px";

    // Tamaño efectivo (puede haber sido redimensionado)
    if (RESIZABLE_TYPES.has(item.type)) {
        const s = getMapItemScale(map);
        const eff = getEffectiveSize(item);
        el.style.width  = (eff.w * s) + "px";
        el.style.height = (eff.h * s) + "px";
    }

    const rot = Number(item.rotation);
    const safeRot = Number.isFinite(rot) ? rot : 0;
    el.style.transform = `rotate(${safeRot}deg)`;
    el.style.setProperty("--rot", `${safeRot}deg`);

    const label = document.createElement("div");
    label.className = "item__label";
    el.appendChild(label);
    renderItemSkin(el, item);
    renderItemLabel(el, item);

    // Handles de resize (solo tipos decorativos)
    if (RESIZABLE_TYPES.has(item.type)) addResizeHandles(el, item);

    // Click: selecciÃ³n (con modificadores para multi)
    el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (getEffectiveMode() === "pan") return;
        if (suppressNextItemClick) { suppressNextItemClick = false; return; }
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (additive) { toggleSelection(item.id); return; }
        if (selectedIds.has(item.id) && selectedIds.size > 1) return;
        setSingleSelection(item.id);
    });

    // Pointerdown: preparar drag
    el.addEventListener("pointerdown", (e) => {
        if (spaceDown) return;
        preventTouchGesture(e);
        if (isTouchPointer(e)) {
            activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            if (activeTouchPointers.size >= 2) {
                beginPinchGesture();
                return;
            }
        }
        e.stopPropagation();
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (additive) {
            if (!selectedIds.has(item.id)) {
                selectedIds.add(item.id);
                updateSelectionUI();
                suppressNextItemClick = true;
            }
        } else {
            if (!selectedIds.has(item.id)) setSingleSelection(item.id);
        }

        el.setPointerCapture(e.pointerId);
        const p = worldPointFromEvent(e, canvas, camera);
        pushHistory();
        dragging = {
            id: item.id,
            startX: p.x,
            startY: p.y,
            moved: false,
            origins: (map.items || [])
                .filter((it) => selectedIds.has(it.id))
                .map((it) => ({ id: it.id, x: it.x, y: it.y })),
        };
    });

    // Pointerup: finalizar drag
    el.addEventListener("pointerup", (e) => {
        if (isTouchPointer(e)) endTouchPointer(e.pointerId);
        try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (dragging?.id === item.id) {
            if (dragging.moved) {
                suppressNextItemClick = true;
                afterAnyChange();
            }
        }
        dragging = null;
    });

    return el;
}

function render() {
    marqueeEl = null;
    guideEls = [];    // world.innerHTML borra los divs de guÃ­a
    world.innerHTML = "";
    setWorldSize();
    applyItemScale();
    (map.items || []).forEach((item) => world.appendChild(createItemElement(item)));
    updateSelectionUI();
    updateSaveUI();
    applyCamera();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Operaciones sobre items / selecciÃ³n
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function addItem(type, x, y) {
    pushHistory();
    const item = {
        id: uid(), type,
        x: Math.round(x), y: Math.round(y),
        rotation: 0, data: {},
    };
    const prefix = getTypePrefix(type);
    if (prefix) {
        const n = await askNumeroRequired(prefix);
        if (n === null) return;
        item.data.numero = n;
    }
    map.items.push(item);
    render();
    setSingleSelection(item.id);
    afterAnyChange();
}

async function addItemCentered(type, point) {
    if (!type || !point) return;
    const s = getItemSize(type, map);
    await addItem(type, point.x - s.w / 2, point.y - s.h / 2);
}

function rotateSelected(direction = 1) {
    if (selectedIds.size === 0) return;
    pushHistory();
    selectedIds.forEach((id) => {
        const it = getItemById(id);
        if (!it) return;
        const rot = Number(it.rotation);
        const safeRot = Number.isFinite(rot) ? rot : 0;
        it.rotation = (safeRot + 90 * direction + 360) % 360;
    });
    render();
    afterAnyChange();
}

async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = await Notify.confirmDanger(
        formatText("¿Eliminar %(count)s elemento(s) seleccionado(s)?", { count: selectedIds.size }),
        {
            title: gettext("Eliminar elementos"),
            okText: gettext("Eliminar"),
            cancelText: gettext("Cancelar"),
        }
    );
    if (!ok) return;
    pushHistory();
    map.items = map.items.filter((it) => !selectedIds.has(it.id));
    clearSelection();
    render();
    afterAnyChange();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Copiar / Pegar / Duplicar
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function copySelected() {
    if (selectedIds.size === 0) return;
    clipboard = copySelectedItems(map.items, selectedIds);
}

function pasteClipboard() {
    if (clipboard.length === 0) return;
    pushHistory();
    const newIds = pasteItems({
        items: map.items,
        clipboard,
        lastWorldMouse,
        uid,
        getTypePrefix,
        nextFreeNumero,
    });

    render();
    selectedIds.clear();
    newIds.forEach((id) => selectedIds.add(id));
    updateSelectionUI();
    afterAnyChange();
}

function duplicateSelected() {
    if (selectedIds.size === 0) return;
    pushHistory();
    const newIds = duplicateItems({
        items: map.items,
        selectedIds,
        uid,
        getTypePrefix,
        nextFreeNumero,
    });

    render();
    selectedIds.clear();
    newIds.forEach((id) => selectedIds.add(id));
    updateSelectionUI();
    afterAnyChange();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MenÃº contextual (clic derecho)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function moveSelectedBy(dx, dy, { snap = false } = {}) {
    if (!map || selectedIds.size === 0) return;
    pushHistory();

    const worldW = map.width || 1920;
    const worldH = map.height || 1080;

    selectedIds.forEach((id) => {
        const it = getItemById(id);
        if (!it) return;

        let a = getAABB(it, map, it.x, it.y);
        let newLeft = a.left + dx;
        let newTop = a.top + dy;

        if (snap) {
            newLeft = snapToGrid(newLeft);
            newTop = snapToGrid(newTop);
        }

        newLeft = clamp(Math.round(newLeft), 0, worldW - a.w);
        newTop = clamp(Math.round(newTop), 0, worldH - a.h);

        it.x = Math.round(xFromAABBLeft(it, newLeft, map));
        it.y = Math.round(yFromAABBTop(it, newTop, map));

        const el = world.querySelector(`.mapItem[data-id="${id}"]`);
        if (el) {
            el.style.left = it.x + "px";
            el.style.top = it.y + "px";
        }
    });

    afterAnyChange();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Drag & Drop desde el sidebar (con ghost preview)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let dragGhost = null;

function setupDragFromSidebar() {
    $$(".tool").forEach((btn) => {
        const t = btn.dataset.tool;
        if (!t || t === "select") return;
        btn.setAttribute("draggable", "true");
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => setPlacementTool(t));
        btn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", t);
            e.dataTransfer.effectAllowed = "copy";
            clearPlacementTool();

            // Imagen de arrastre transparente (1x1) para que no se vea la default
            const blank = document.createElement("canvas");
            blank.width = 1; blank.height = 1;
            e.dataTransfer.setDragImage(blank, 0, 0);
        });
    });

    canvas.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";

        const type = e.dataTransfer.types.includes("text/plain")
            ? (dragGhost?.dataset.itemType || null) : null;

        // Crear o mover el ghost
        if (type || dragGhost) {
            const p = worldPointFromEvent(e, canvas, camera);
            if (!dragGhost) {
                // Intentar leer el tipo del texto (disponible en dragstart pero no en dragover en algunos browsers)
                // Usamos el tipo almacenado
            }
            if (dragGhost) {
                const s = getItemSize(dragGhost.dataset.itemType, map);
                dragGhost.style.left = (p.x - s.w / 2) + "px";
                dragGhost.style.top = (p.y - s.h / 2) + "px";
            }
        }
    });

    // Mostrar ghost al entrar al canvas
    canvas.addEventListener("dragenter", (e) => {
        // Leer tipo de la transferencia
        const type = e.dataTransfer.getData("text/plain");
        // En dragenter no siempre estÃ¡ disponible getData, asÃ­ que buscamos
        // desde las herramientas cuÃ¡l se estÃ¡ arrastrando
        const draggingTool = document.querySelector('.tool[draggable="true"]:active')
            || document.querySelector('.tool[draggable="true"]:focus');
        const itemType = type || draggingTool?.dataset.tool;

        if (itemType && !dragGhost) {
            const s = getItemSize(itemType, map);
            const ghost = document.createElement("div");
            ghost.className = `mapItem item--${itemType} drag-ghost`;
            ghost.dataset.itemType = itemType;
            ghost.style.width = s.w + "px";
            ghost.style.height = s.h + "px";
            const p = worldPointFromEvent(e, canvas, camera);
            ghost.style.left = (p.x - s.w / 2) + "px";
            ghost.style.top = (p.y - s.h / 2) + "px";
            world.appendChild(ghost);
            dragGhost = ghost;
        }
    });

    canvas.addEventListener("dragleave", (e) => {
        // Solo quitar si sale del canvas (no de un hijo)
        if (e.relatedTarget && canvas.contains(e.relatedTarget)) return;
        if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    });

    canvas.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragGhost) { dragGhost.remove(); dragGhost = null; }

        const type = e.dataTransfer.getData("text/plain");
        if (!type) return;
        const p = worldPointFromEvent(e, canvas, camera);
        const s = getItemSize(type, map);
        addItem(type, p.x - s.w / 2, p.y - s.h / 2);
    });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Picker "Mis mapas"
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function setupPicker() {
    const picker = $("#picker");
    const btn = $("#mapPicker");
    const drop = $("#pickerDrop");
    const btnNew = $("#btnNewMap");

    if (!picker || !btn || !drop) return;

    function open() {
        drop.classList.add("is-open");
        drop.setAttribute("aria-hidden", "false");
        btn.setAttribute("aria-expanded", "true");
        picker.classList.add("is-drop-open");
    }
    function close() {
        drop.classList.remove("is-open");
        drop.setAttribute("aria-hidden", "true");
        btn.setAttribute("aria-expanded", "false");
        picker.classList.remove("is-drop-open");
    }

    async function refreshList() {
        try {
            const data = await apiListMaps();
            const maps = data.maps || [];

            drop.innerHTML = "";

            // Encabezado: enlace a la pÃ¡gina de gestiÃ³n de mapas
            const header = document.createElement("a");
            header.className = "picker__header";
            header.href = CFG.mapsListUrl;
            header.textContent = gettext("Gestionar mapas");
            drop.appendChild(header);

            if (maps.length === 0) {
                const empty = document.createElement("div");
                empty.className = "picker__empty";
                empty.textContent = gettext("No hay mapas guardados");
                drop.appendChild(empty);
                return;
            }

            maps.forEach((m) => {
                const item = document.createElement("button");
                item.className = "picker__item";
                if (map?.id && m.id === map.id) item.classList.add("is-current");
                item.type = "button";
                item.textContent = m.name || formatText("Mapa #%(id)s", { id: m.id });

                item.addEventListener("click", async () => {
                    if (hasChanges()) {
                        const wantsSave = await Notify.confirm(
                            gettext("Tienes cambios sin guardar. ¿Quieres guardarlos antes de abrir otro mapa?"),
                            {
                                title: gettext("Cambios sin guardar"),
                                okText: gettext("Guardar"),
                                cancelText: gettext("No guardar"),
                            }
                        );
                        if (wantsSave) {
                            const saved = await saveCurrentMap();
                            if (!saved) return;
                        }
                    }
                    const qs = `?id=${m.id}`;
                    history.replaceState({}, "", CFG.editorUrl + qs);
                    await loadOrCreate();
                    syncResolutionControl(map?.width || 1920, map?.height || 1080);
                    render();
                    fitToScreen();
                    afterAnyChange();
                    close();
                });

                drop.appendChild(item);
            });
        } catch (err) {
            console.error("Error al listar mapas:", err);
        }
    }

    btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const isOpen = drop.classList.contains("is-open");
        if (isOpen) { close(); return; }
        await refreshList();
        open();
    });

    document.addEventListener("click", (e) => {
        if (!picker.contains(e.target)) close();
    });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Load / Save / Delete map
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadOrCreate() {
    const qs = getQuery();
    const id = qs.get("id") || qs.get("edit");

    if (id) {
        try {
            const data = await apiLoadMap(id);
            map = {
                id: data.id,
                name: data.name || "",
                width: data.width || 1920,
                height: data.height || 1080,
                floor: data.floor ?? "",
                items: (data.items || []).map((it) => ({
                    id: it.id || uid(),
                    type: it.type,
                    x: Number(it.x) || 0,
                    y: Number(it.y) || 0,
                    rotation: Number(it.rotation) || 0,
                    data: it.data || {},
                })),
            };
            mapName.value = map.name;
            savedName = map.name;
            hasSaved = true;
            savedSnapshot = computeSnapshot();
            applyFloor(map.floor ?? "");
            return;
        } catch (err) {
            console.error("Error al cargar mapa:", err);
            await Notify.error(gettext("No se pudo cargar el mapa."));
        }
    }

    // Crear nuevo
    map = { id: null, name: "", width: 1920, height: 1080, items: [] };
    mapName.value = "";
    savedName = "";
    hasSaved = false;
    savedSnapshot = "";
}

async function saveCurrentMap() {
    const name = mapName.value.trim();
    if (!name) { await Notify.info(gettext("Escribe un nombre para el mapa.")); return false; }

    const payload = {
        name,
        width: map.width,
        height: map.height,
        floor: currentFloor,
        items: (map.items || []).map((it) => ({
            id: it.id, type: it.type,
            x: Math.round(it.x), y: Math.round(it.y),
            rotation: it.rotation || 0,
            data: it.data || {},
        })),
    };

    try {
        const data = await apiSaveMap(payload, map.id || 0);

        if (data.id) {
            map.id = data.id;
            if (!getQuery().get("id")) {
                history.replaceState({}, "", CFG.editorUrl + `?id=${data.id}`);
            }
        }

        hasSaved = true;
        savedSnapshot = computeSnapshot();
        savedName = name;

        flashSaved();
        afterAnyChange();
        return true;
    } catch (err) {
        console.error("Error al guardar:", err);
        await Notify.error(gettext("Error al guardar el mapa."));
        return false;
    }
}

async function deleteMap() {
    if (!map?.id) return;
    const ok = await Notify.confirmDanger(
        gettext("¿Seguro que quieres eliminar este mapa? Esta acción no se puede deshacer."),
        {
            title: gettext("Eliminar mapa"),
            okText: gettext("Eliminar"),
            cancelText: gettext("Cancelar"),
        }
    );
    if (!ok) return;

    try {
        await apiDeleteMap(map.id);

        map = { id: null, name: "", width: 1920, height: 1080, items: [] };
        selectedIds.clear();
        mapName.value = "";
        savedName = "";
        hasSaved = false;
        savedSnapshot = "";

        history.replaceState({}, "", CFG.editorUrl);
        render();
        afterAnyChange();

        mapName.focus();
    } catch (err) {
        console.error("Error al borrar mapa:", err);
        await Notify.error(gettext("Error al borrar el mapa."));
    }
}

async function confirmLeave() {
    if (!hasChanges()) return true;
    return await Notify.confirmDanger(
        gettext("Tienes cambios sin guardar. ¿Quieres salir sin guardar?"),
        {
            title: gettext("Cambios sin guardar"),
            okText: gettext("Salir sin guardar"),
            cancelText: gettext("Cancelar"),
        }
    );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Modos (pan / select)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getEffectiveMode() {
    if (spaceDown) return panMode ? "select" : "pan";
    return panMode ? "pan" : "select";
}

function updatePanReadyCursor() {
    canvas.classList.toggle("is-pan-ready", getEffectiveMode() === "pan");
    canvas.classList.toggle("is-placement-ready", !!placementTool && getEffectiveMode() === "select");
}

function updateToolButtons() {
    const btnPanMode = $("#btnPanMode");
    const btnSelectMode = $('.tool[data-tool="select"]');
    const isSelectMode = !panMode && !placementTool;

    if (btnPanMode) {
        const active = panMode && !placementTool;
        btnPanMode.classList.toggle("is-active", active);
        btnPanMode.setAttribute("aria-pressed", String(active));
    }
    if (btnSelectMode) {
        btnSelectMode.classList.toggle("is-active", isSelectMode);
        btnSelectMode.setAttribute("aria-pressed", String(isSelectMode));
    }

    $$(".tool[data-tool]").forEach((btn) => {
        const tool = btn.dataset.tool;
        if (!tool || tool === "select") return;
        const active = placementTool === tool;
        btn.classList.toggle("is-placement-active", active);
        btn.setAttribute("aria-pressed", String(active));
    });
}

function setPlacementTool(type) {
    placementTool = placementTool === type ? null : type;
    if (placementTool) panMode = false;
    updateToolButtons();
    updatePanReadyCursor();
}

function clearPlacementTool() {
    placementTool = null;
    updateToolButtons();
    updatePanReadyCursor();
}

function setMode(mode) {
    placementTool = null;
    panMode = mode === "pan";
    spaceDown = false;
    updatePanReadyCursor();
    updateToolButtons();

    if (panMode) clearSelection();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Eventos principales
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupEvents() {
    // Botones de modo
    const btnPanMode = $("#btnPanMode");
    const btnSelectMode = $('.tool[data-tool="select"]');
    btnPanMode?.addEventListener("click", () => setMode("pan"));
    btnSelectMode?.addEventListener("click", () => setMode("select"));

    // Editar nÃºmero
    btnEditNumber?.addEventListener("click", async () => {
        if (selectedIds.size !== 1) return;
        const id = [...selectedIds][0];
        const it = getItemById(id);
        if (!it) return;
        const prefix = getTypePrefix(it.type);
        if (!prefix) return;

        pushHistory();
        const current = String(it.data?.numero ?? "");
        const n = await askNumeroRequired(prefix, current, { excludeId: it.id });
        if (n === null) return;
        it.data.numero = n;
        const el = world.querySelector(`.mapItem[data-id="${id}"]`);
        renderItemLabel(el, it);
        afterAnyChange();
    });

    // Modo inicial
    setMode("select");

    // Rastrear posiciÃ³n del ratÃ³n en coordenadas mundo
    canvas.addEventListener("pointermove", (e) => {
        lastWorldMouse = worldPointFromEvent(e, canvas, camera);
    }, { passive: true });

    // En tÃ¡ctil el lienzo debe ganar a los gestos nativos del navegador.
    ["touchstart", "touchmove"].forEach((eventName) => {
        canvas.addEventListener(eventName, (e) => {
            if (e.cancelable) e.preventDefault();
        }, { passive: false });
    });

    canvasWrap?.addEventListener("pointerdown", (e) => {
        if (!isTouchPointer(e)) return;
        preventTouchGesture(e);
        activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        try { canvasWrap.setPointerCapture(e.pointerId); } catch { /* noop */ }
        if (activeTouchPointers.size >= 2) {
            beginPinchGesture();
            e.stopPropagation();
        }
    }, true);

    canvasWrap?.addEventListener("pointermove", (e) => {
        if (!isTouchPointer(e) || !activeTouchPointers.has(e.pointerId)) return;
        activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        if (pinchGesture) {
            preventTouchGesture(e);
            updatePinchGesture();
            e.stopPropagation();
        }
    }, true);

    canvasWrap?.addEventListener("pointerup", (e) => {
        if (!isTouchPointer(e)) return;
        if (pinchGesture || activeTouchPointers.size > 1) {
            preventTouchGesture(e);
            endTouchPointer(e.pointerId);
            e.stopPropagation();
        }
    }, true);

    canvasWrap?.addEventListener("pointercancel", (e) => {
        if (!isTouchPointer(e)) return;
        if (pinchGesture || activeTouchPointers.size > 1) {
            preventTouchGesture(e);
            endTouchPointer(e.pointerId);
            e.stopPropagation();
        }
    }, true);

    // â”€â”€â”€ MenÃº contextual (clic derecho) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        lastWorldMouse = worldPointFromEvent(e, canvas, camera);

        // Â¿Hay un item bajo el cursor?
        const clickedItem = e.target.closest?.(".mapItem");
        const itemId = clickedItem?.dataset.id;

        if (itemId) {
            // Asegurar que estÃ¡ seleccionado
            if (!selectedIds.has(itemId)) setSingleSelection(itemId);

            const it = getItemById(itemId);
            const prefix = it ? getTypePrefix(it.type) : null;

            showContextMenu(e.clientX, e.clientY, [
                { label: gettext("Copiar"), action: () => copySelected() },
                { label: gettext("Duplicar"), action: () => duplicateSelected() },
                "---",
                ...(prefix ? [{
                    label: gettext("Editar número"),
                    action: async () => {
                        const current = String(it.data?.numero ?? "");
                        pushHistory();
                        const n = await askNumeroRequired(prefix, current, { excludeId: it.id });
                        if (n === null) return;
                        it.data.numero = n;
                        const el = world.querySelector(`.mapItem[data-id="${itemId}"]`);
                        renderItemLabel(el, it);
                        afterAnyChange();
                    }
                }] : []),
                { label: gettext("Rotar izquierda"), action: () => rotateSelected(-1) },
                { label: gettext("Rotar derecha"), action: () => rotateSelected(1) },
                "---",
                { label: gettext("Eliminar"), danger: true, action: () => deleteSelected() },
            ]);
        } else {
            // Clic derecho en canvas vacÃ­o
            showContextMenu(e.clientX, e.clientY, [
                { label: gettext("Pegar"), disabled: clipboard.length === 0, action: () => pasteClipboard() },
                {
                    label: gettext("Seleccionar todo"), action: () => {
                        (map.items || []).forEach((it) => selectedIds.add(it.id));
                        updateSelectionUI();
                    }
                },
            ]);
        }
    });

    // â”€â”€â”€ Pointerdown: pan o marquee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        preventTouchGesture(e);
        if (isTouchPointer(e)) {
            activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
            if (activeTouchPointers.size >= 2) {
                beginPinchGesture();
                return;
            }
        }
        const mode = getEffectiveMode();
        const clickedEmpty = e.target === canvas || e.target === world;

        if (placementTool && mode === "select" && clickedEmpty) {
            e.preventDefault();
            const p = worldPointFromEvent(e, canvas, camera);
            lastWorldMouse = p;
            void addItemCentered(placementTool, p);
            clearPlacementTool();
            suppressNextCanvasClick = true;
            setTimeout(() => { suppressNextCanvasClick = false; }, 0);
            return;
        }

        if (mode === "pan" && clickedEmpty) {
            panning = {
                startX: e.clientX, startY: e.clientY,
                originX: camera.panX, originY: camera.panY,
            };
            canvas.setPointerCapture(e.pointerId);
            canvas.classList.add("is-panning");
            return;
        }

        if (mode !== "select") return;
        if (dragging) return;
        if (!clickedEmpty) return;

        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        const p = worldPointFromEvent(e, canvas, camera);
        marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, additive };
        marqueeBaseSelection = new Set(selectedIds);
        canvas.setPointerCapture(e.pointerId);
        drawMarquee(marquee);
        updateMarqueeSelection();
    });

    // â”€â”€â”€ Pointermove: pan, drag items, marquee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    canvas.addEventListener("pointermove", (e) => {
        if (isTouchPointer(e) && activeTouchPointers.has(e.pointerId)) {
            activeTouchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            if (pinchGesture) {
                preventTouchGesture(e);
                updatePinchGesture();
                return;
            }
        }

        // PAN
        if (panning) {
            preventTouchGesture(e);
            camera.panX = panning.originX + (e.clientX - panning.startX);
            camera.panY = panning.originY + (e.clientY - panning.startY);
            clampCamera();
            applyCamera();
            return;
        }

        // DRAG de items (grupo) â€” con snapping corregido
        if (dragging) {
            preventTouchGesture(e);
            const p = worldPointFromEvent(e, canvas, camera);
            let dx = p.x - dragging.startX;
            let dy = p.y - dragging.startY;

            const worldW = map.width || 1920;
            const worldH = map.height || 1080;

            // Clamp grupo dentro del mundo
            let minGroupX = Infinity, minGroupY = Infinity;
            let maxGroupX = -Infinity, maxGroupY = -Infinity;

            dragging.origins.forEach((o) => {
                const it = getItemById(o.id);
                if (!it) return;
                const a = getAABB(it, map, o.x, o.y);
                minGroupX = Math.min(minGroupX, a.left);
                minGroupY = Math.min(minGroupY, a.top);
                maxGroupX = Math.max(maxGroupX, a.right);
                maxGroupY = Math.max(maxGroupY, a.bottom);
            });

            dx = Math.max(dx, -minGroupX);
            dy = Math.max(dy, -minGroupY);
            dx = Math.min(dx, worldW - maxGroupX);
            dy = Math.min(dy, worldH - maxGroupY);

            // â”€â”€ Snap con el nuevo sistema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            // Preparar items movidos con posiciones tentativas
            const movedItems = dragging.origins
                .map((o) => {
                    const it = getItemById(o.id);
                    if (!it) return null;
                    return { item: it, targetX: o.x + dx, targetY: o.y + dy };
                })
                .filter(Boolean);

            const otherItems = (map.items || []).filter((it) => !selectedIds.has(it.id));

            const snap = computeSnap(movedItems, otherItems, map, {
                zoom: camera.zoom,
                useGrid: !e.altKey,
            });

            // â”€â”€ GuÃ­as (mÃºltiples por eje) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            showGuides(snap.guidesX, snap.guidesY);

            // â”€â”€ Aplicar posiciÃ³n final (uniforme a todo el grupo) â”€â”€
            dragging.origins.forEach((o) => {
                const it = getItemById(o.id);
                if (!it) return;

                const newX = Math.round(o.x + dx + snap.dx);
                const newY = Math.round(o.y + dy + snap.dy);

                if (newX !== it.x || newY !== it.y) dragging.moved = true;

                it.x = newX;
                it.y = newY;

                const el = world.querySelector(`.mapItem[data-id="${o.id}"]`);
                if (el) {
                    el.style.left = it.x + "px";
                    el.style.top = it.y + "px";
                }
            });

            afterAnyChange();
            return;
        }

        // MARQUEE
        if (marquee) {
            preventTouchGesture(e);
            const p = worldPointFromEvent(e, canvas, camera);
            marquee.x2 = p.x;
            marquee.y2 = p.y;
            drawMarquee(marquee);
            updateMarqueeSelection();
        }
    });

    // â”€â”€â”€ Pointerup: cerrar pan / marquee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    canvas.addEventListener("pointerup", (e) => {
        preventTouchGesture(e);
        if (isTouchPointer(e)) {
            endTouchPointer(e.pointerId);
            if (pinchGesture || activeTouchPointers.size > 0) return;
        }
        hideGuides();

        if (panning) {
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            panning = null;
            canvas.classList.remove("is-panning");
            suppressNextCanvasClick = true;
            setTimeout(() => { suppressNextCanvasClick = false; }, 0);
            return;
        }

        if (!marquee) return;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }

        updateMarqueeSelection();

        marquee = null;
        marqueeBaseSelection = null;
        hideMarquee();
        updateSelectionUI();

        suppressNextCanvasClick = true;
        setTimeout(() => { suppressNextCanvasClick = false; }, 0);
    });

    // Cancelaciones
    canvas.addEventListener("pointercancel", (e) => {
        if (isTouchPointer(e)) endTouchPointer(e.pointerId);
        if (panning) {
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            panning = null;
            canvas.classList.remove("is-panning");
        }
        if (marquee) {
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            marquee = null;
            marqueeBaseSelection = null;
            hideMarquee();
        }
    });

    // Click en vacÃ­o: deseleccionar
    canvas.addEventListener("click", (e) => {
        if (suppressNextCanvasClick) return;
        if (getEffectiveMode() !== "select") return;
        const clickedEmpty = e.target === canvas || e.target === world || e.target.classList.contains("marquee");
        if (!clickedEmpty) return;
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!additive) clearSelection();
    });

    // Zoom con rueda
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const before = worldPointFromEvent(e, canvas, camera);
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        camera.zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * delta));
        const rect = canvas.getBoundingClientRect();
        camera.panX = (e.clientX - rect.left) - before.x * camera.zoom;
        camera.panY = (e.clientY - rect.top) - before.y * camera.zoom;
        clampCamera();
        applyCamera();
    }, { passive: false });

    // ── Suelo (picker dropdown) ───────────────────────────────────────────────
    const floorPicker    = document.getElementById("floorPicker");
    const floorPickerBtn = document.getElementById("floorPickerBtn");
    const floorPickerDrop= document.getElementById("floorPickerDrop");

    floorPickerBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = floorPickerDrop.classList.toggle("is-open");
        floorPicker.classList.toggle("is-drop-open", isOpen);
    });

    document.querySelectorAll(".floorDrop__item").forEach((item) => {
        item.addEventListener("click", () => {
            applyFloor(item.dataset.floor);
            floorPickerDrop.classList.remove("is-open");
            floorPicker.classList.remove("is-drop-open");
            markDirty?.();
        });
    });

    document.addEventListener("click", (e) => {
        if (floorPicker && !floorPicker.contains(e.target)) {
            floorPickerDrop?.classList.remove("is-open");
            floorPicker.classList.remove("is-drop-open");
        }
    });

    // Acciones UI
    btnRotateL?.addEventListener("click", () => rotateSelected(-1));
    btnRotateR?.addEventListener("click", () => rotateSelected(1));
    btnDelete?.addEventListener("click", deleteSelected);
    btnSave?.addEventListener("click", saveCurrentMap);
    btnDeleteMap?.addEventListener("click", deleteMap);

    mapName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveCurrentMap(); }
    });

    // Crear nuevo mapa
    btnNewMap?.addEventListener("click", async () => {
        if (hasChanges()) {
            const wantsSave = await Notify.confirm(
                gettext("Tienes cambios sin guardar. ¿Quieres guardarlos antes de crear un mapa nuevo?"),
                {
                    title: gettext("Cambios sin guardar"),
                    okText: gettext("Guardar"),
                    cancelText: gettext("No guardar"),
                }
            );
            if (wantsSave) {
                const saved = await saveCurrentMap();
                if (!saved) return;
            }
        }
        map = { id: null, name: "", width: 1920, height: 1080, items: [] };
        selectedIds.clear();
        dragging = null;
        mapName.value = "";
        savedName = "";
        hasSaved = false;
        savedSnapshot = "";
        history.replaceState({}, "", CFG.editorUrl);
        syncResolutionControl(map.width, map.height);
        render();
        afterAnyChange();
        mapName.focus();
        mapName.select();
    });

    // Volver
    btnBack?.addEventListener("click", async (e) => {
        e.preventDefault();
        const canLeave = await confirmLeave();
        if (!canLeave) return;
        if (btnBack.href) window.location.href = btnBack.href;
    });

    // Nombre: actualiza UI
    mapName.addEventListener("input", afterAnyChange);

    btnNameCancel?.addEventListener("click", () => {
        mapName.value = savedName;
        afterAnyChange();
    });

    // ResoluciÃ³n: usa el select comÃºn de la aplicaciÃ³n.
    resolutionSelect?.addEventListener("change", () => {
        if (syncingResolutionSelect) return;
        const [w, h] = resolutionSelect.value.split("x").map(Number);
        if (!map || !w || !h) return;
        map.width = w;
        map.height = h;
        setWorldSize();
        applyItemScale();
        fitToScreen();
        afterAnyChange();
    });

    syncResolutionControl(map?.width || 1920, map?.height || 1080);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Init
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function init() {
    await loadOrCreate();
    await setupPicker();

    setupEvents();
    setupDragFromSidebar();

    render();
    fitToScreen();
    clearSelection();
    afterAnyChange();

    window.addEventListener("resize", fitToScreen);

    window.addEventListener("keydown", (e) => {
        if (e.key === "f" || e.key === "F") fitToScreen();
    });

    // Space: invertir modo temporalmente / Ctrl+Space: cambio permanente
    window.addEventListener("keydown", (e) => {
        if (e.code !== "Space") return;
        e.preventDefault();

        // Ctrl + Space â†’ cambio permanente de modo
        if (e.ctrlKey || e.metaKey) {
            setMode(panMode ? "select" : "pan");
            return;
        }

        // Space solo â†’ inversiÃ³n temporal mientras se mantiene
        if (!spaceDown) {
            spaceDown = true;
            updatePanReadyCursor();
            updateToolButtons();
        }
    });

    window.addEventListener("keyup", (e) => {
        if (e.code !== "Space") return;
        spaceDown = false;
        updatePanReadyCursor();
        updateToolButtons();
    });

    // Atajos de teclado (cuando no se estÃ¡ en input)
    window.addEventListener("keydown", (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        if ((e.key === "r" || e.key === "R") && e.shiftKey) {
            if (selectedIds.size > 0) { e.preventDefault(); rotateSelected(-1); }
            return;
        }
        if (e.key === "r" || e.key === "R") {
            if (selectedIds.size > 0) { e.preventDefault(); rotateSelected(1); }
            return;
        }
        if (e.key === "Delete") {
            if (selectedIds.size > 0) { e.preventDefault(); deleteSelected(); }
            return;
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            if (!map || selectedIds.size === 0) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            let dx = 0, dy = 0;
            if (e.key === "ArrowUp") dy = -step;
            if (e.key === "ArrowDown") dy = step;
            if (e.key === "ArrowLeft") dx = -step;
            if (e.key === "ArrowRight") dx = step;
            moveSelectedBy(dx, dy, { snap: (e.ctrlKey || e.metaKey) });
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            e.preventDefault(); undo(); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
            e.preventDefault(); redo(); return;
        }
        // Duplicar
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
            e.preventDefault();
            if (selectedIds.size > 0) duplicateSelected();
            return;
        }
        // Copiar
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copySelected();
            return;
        }
        // Pegar
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            e.preventDefault();
            pasteClipboard();
            return;
        }
        // Seleccionar todo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            (map.items || []).forEach((it) => selectedIds.add(it.id));
            updateSelectionUI();
            return;
        }
    });
}

// ES modules se ejecutan despuÃ©s del parsing del DOM (deferred),
// pero usamos DOMContentLoaded por seguridad.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
