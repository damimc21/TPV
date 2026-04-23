/* map_editor.js — Módulo principal del editor de mapas TPV
   
   Módulo de entrada (ES module). Importa la lógica pura de:
   - utils.js     → helpers, constantes, tipos
   - api.js       → persistencia Django
   - geometry.js  → AABB, tamaños, coordenadas
   - snapping.js  → magnetismo corregido
*/

import {
    $, $$, escapeHtml, clamp, snapToGrid, uid, getQuery, overlap1D,
    GRID, SNAP_THRESHOLD, getTypePrefix, isNumberedType, normalizeNumero
} from './utils.js';
import { apiSaveMap, apiLoadMap, apiListMaps, apiDeleteMap } from './api.js';
import {
    getMapItemScale, getItemBaseSize, getItemSize, normRot, getAABB,
    xFromAABBLeft, yFromAABBTop, worldPointFromEvent, normRect, rectsIntersect
} from './geometry.js';
import { computeSnap } from './snapping.js';
import { showPrompt } from './modal.js';

// ─────────────────────────────────────────────────────────────
// DOM / Config
// ─────────────────────────────────────────────────────────────
const canvas = $("#canvas");
const world = $("#world");
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

const mapPicker = $("#mapPicker");
const pickerDrop = $("#pickerDrop");
const btnNewMap = $("#btnNewMap");

const cfgEl = $("#map-editor-config");
const CFG = cfgEl
    ? JSON.parse(cfgEl.textContent)
    : { mapsListUrl: "/config/maps/", editorUrl: "/config/maps/create/" };
const Notify = window.Notify;

// Seguridad: si se carga en una página sin editor, no hacemos nada
if (!canvas || !world || !mapName) {
    throw new Error("map_editor: elementos DOM no encontrados, abortando.");
}

// ─────────────────────────────────────────────────────────────
// Estado del editor
// ─────────────────────────────────────────────────────────────
let map = null;
let selectedIds = new Set();

// Undo/Redo
let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 50;

// Modos: pan / select (space invierte temporalmente)
let panMode = true;
let spaceDown = false;

// Interacciones
let dragging = null;
let marquee = null;
let marqueeEl = null;
let suppressNextCanvasClick = false;
let suppressNextItemClick = false;

// Clipboard (copia interna de items para pegar)
let clipboard = [];

// Posición del ratón en coordenadas mundo (para pegar en cursor)
let lastWorldMouse = { x: 0, y: 0 };

// Menú contextual
let ctxMenuEl = null;

// Guías de alineación (pool dinámico)
let guideEls = [];  // pool de elementos guía reutilizables

// Estado del nombre
let savedName = "";

// Estado guardado / cambios
let hasSaved = false;
let savedSnapshot = "";

// Pan
let panning = null;

// Cámara
let minZoom = 0.2;
const maxZoom = 3;

const camera = { zoom: 1, panX: 0, panY: 0 };

// ─────────────────────────────────────────────────────────────
// Snapshot / Dirty / UI contextual
// ─────────────────────────────────────────────────────────────
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
        saveState.textContent = "• Sin nombre";
        saveState.style.color = "rgba(255,255,255,.6)";
        return;
    }
    if (dirty) {
        saveState.textContent = "• Sin guardar";
        saveState.style.color = "rgba(255,210,90,.9)";
        return;
    }
    saveState.textContent = "✓ Guardado";
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

// ─────────────────────────────────────────────────────────────
// Cámara / Pan / Zoom
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Marquee + Guías
// ─────────────────────────────────────────────────────────────
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

    // Guías verticales (eje X)
    for (const pos of guidesX) {
        const el = guideEls[idx++];
        el.className = "align-guide-x";
        el.style.left = pos + "px";
        el.style.top = "";
        el.classList.remove("hidden");
    }

    // Guías horizontales (eje Y)
    for (const pos of guidesY) {
        const el = guideEls[idx++];
        el.className = "align-guide-y";
        el.style.top = pos + "px";
        el.style.left = "";
        el.classList.remove("hidden");
    }
}

// ─────────────────────────────────────────────────────────────
// Numeración
// ─────────────────────────────────────────────────────────────
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

/** Devuelve el siguiente número libre para un prefijo, a partir de los items actuales */
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
        const r = await showPrompt(`Numero para ${prefix}:`, current, {
            title: `Numero ${prefix}`,
            placeholder: "1-999",
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
            await Notify.info("Ese numero ya esta usado en esta seleccion. Elige otro.");
            continue;
        }
        if (isNumeroUsed(prefix, n, excludeId)) {
            await Notify.info(`${prefix} ${n} ya existe. Elige otro.`);
            continue;
        }
        return n;
    }
}

// ─────────────────────────────────────────────────────────────
// Selección
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────
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

function createItemElement(item) {
    const el = document.createElement("div");
    el.className = `mapItem item--${item.type}`;
    el.dataset.id = item.id;
    el.style.left = item.x + "px";
    el.style.top = item.y + "px";

    const rot = Number(item.rotation);
    const safeRot = Number.isFinite(rot) ? rot : 0;
    el.style.transform = `rotate(${safeRot}deg)`;
    el.style.setProperty("--rot", `${safeRot}deg`);

    const label = document.createElement("div");
    label.className = "item__label";
    el.appendChild(label);
    renderItemLabel(el, item);

    // Click: selección (con modificadores para multi)
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
    guideEls = [];    // world.innerHTML borra los divs de guía
    world.innerHTML = "";
    setWorldSize();
    applyItemScale();
    (map.items || []).forEach((item) => world.appendChild(createItemElement(item)));
    updateSelectionUI();
    updateSaveUI();
    applyCamera();
}

// ─────────────────────────────────────────────────────────────
// Operaciones sobre items / selección
// ─────────────────────────────────────────────────────────────
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
        `¿Eliminar ${selectedIds.size} elemento(s) seleccionado(s)?`,
        { title: "Eliminar elementos", okText: "Eliminar" }
    );
    if (!ok) return;
    pushHistory();
    map.items = map.items.filter((it) => !selectedIds.has(it.id));
    clearSelection();
    render();
    afterAnyChange();
}

// ─────────────────────────────────────────────────────────────
// Copiar / Pegar / Duplicar
// ─────────────────────────────────────────────────────────────

function copySelected() {
    if (selectedIds.size === 0) return;
    clipboard = (map.items || []).filter((it) => selectedIds.has(it.id))
        .map((it) => JSON.parse(JSON.stringify(it)));  // deep clone
}

function pasteClipboard() {
    if (clipboard.length === 0) return;
    pushHistory();

    // Calcular centro actual del clipboard para centrar en cursor
    let cx = 0, cy = 0;
    for (const it of clipboard) { cx += it.x; cy += it.y; }
    cx /= clipboard.length;
    cy /= clipboard.length;

    const dx = lastWorldMouse.x - cx;
    const dy = lastWorldMouse.y - cy;

    const newIds = new Set();

    clipboard.forEach((orig) => {
        const clone = JSON.parse(JSON.stringify(orig));
        clone.id = uid();
        clone.x = Math.round(clone.x + dx);
        clone.y = Math.round(clone.y + dy);

        // Auto-numerar items numerados
        const prefix = getTypePrefix(clone.type);
        if (prefix) {
            clone.data = clone.data || {};
            clone.data.numero = nextFreeNumero(prefix);
        }

        map.items.push(clone);
        newIds.add(clone.id);
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

    const OFFSET = 20;
    const newIds = new Set();
    const originals = (map.items || []).filter((it) => selectedIds.has(it.id));

    originals.forEach((orig) => {
        const clone = JSON.parse(JSON.stringify(orig));
        clone.id = uid();
        clone.x = clone.x + OFFSET;
        clone.y = clone.y + OFFSET;

        const prefix = getTypePrefix(clone.type);
        if (prefix) {
            clone.data = clone.data || {};
            clone.data.numero = nextFreeNumero(prefix);
        }

        map.items.push(clone);
        newIds.add(clone.id);
    });

    render();
    selectedIds.clear();
    newIds.forEach((id) => selectedIds.add(id));
    updateSelectionUI();
    afterAnyChange();
}

// ─────────────────────────────────────────────────────────────
// Menú contextual (clic derecho)
// ─────────────────────────────────────────────────────────────

function closeContextMenu() {
    if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

function showContextMenu(x, y, items) {
    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "ctx-menu";

    items.forEach((entry) => {
        if (entry === "---") {
            const sep = document.createElement("div");
            sep.className = "ctx-menu__sep";
            menu.appendChild(sep);
            return;
        }

        const btn = document.createElement("button");
        btn.className = "ctx-menu__item";
        if (entry.danger) btn.classList.add("ctx-menu__item--danger");
        if (entry.disabled) btn.disabled = true;
        btn.type = "button";
        btn.innerHTML = `<span>${entry.icon || ''}</span><span>${entry.label}</span>`;
        btn.addEventListener("click", () => {
            closeContextMenu();
            entry.action?.();
        });
        menu.appendChild(btn);
    });

    // Posicionar (ajustando si se sale de pantalla)
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";

    ctxMenuEl = menu;

    // Cerrar al hacer clic fuera
    setTimeout(() => {
        function onClickOut(e) {
            if (!menu.contains(e.target)) {
                closeContextMenu();
                window.removeEventListener("pointerdown", onClickOut);
            }
        }
        window.addEventListener("pointerdown", onClickOut);
    }, 0);
}

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

// ─────────────────────────────────────────────────────────────
// Drag & Drop desde el sidebar (con ghost preview)
// ─────────────────────────────────────────────────────────────
let dragGhost = null;

function setupDragFromSidebar() {
    $$(".tool").forEach((btn) => {
        const t = btn.dataset.tool;
        if (!t || t === "select") return;
        btn.setAttribute("draggable", "true");
        btn.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", t);
            e.dataTransfer.effectAllowed = "copy";

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
        // En dragenter no siempre está disponible getData, así que buscamos
        // desde las herramientas cuál se está arrastrando
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

// ─────────────────────────────────────────────────────────────
// Picker "Mis mapas"
// ─────────────────────────────────────────────────────────────
async function setupPicker() {
    const picker = $("#picker");
    const btn = $("#mapPicker");
    const drop = $("#pickerDrop");
    const btnNew = $("#btnNewMap");

    if (!picker || !btn || !drop) return;

    function open() { drop.classList.add("is-open"); drop.setAttribute("aria-hidden", "false"); picker.classList.add("is-drop-open"); }
    function close() { drop.classList.remove("is-open"); drop.setAttribute("aria-hidden", "true"); picker.classList.remove("is-drop-open"); }

    async function refreshList() {
        try {
            const data = await apiListMaps();
            const maps = data.maps || [];

            drop.innerHTML = "";

            // Encabezado: enlace a la página de gestión de mapas
            const header = document.createElement("a");
            header.className = "picker__header";
            header.href = CFG.mapsListUrl;
            header.textContent = "📋 Gestionar mapas →";
            drop.appendChild(header);

            if (maps.length === 0) {
                const empty = document.createElement("div");
                empty.className = "picker__empty";
                empty.textContent = "No hay mapas guardados";
                drop.appendChild(empty);
                return;
            }

            maps.forEach((m) => {
                const item = document.createElement("button");
                item.className = "picker__item";
                if (map?.id && m.id === map.id) item.classList.add("is-current");
                item.type = "button";
                item.textContent = escapeHtml(m.name || `Mapa #${m.id}`);

                item.addEventListener("click", async () => {
                    if (hasChanges()) {
                        const wantsSave = await Notify.confirm(
                            "Tienes cambios sin guardar. ¿Quieres guardarlos antes de abrir otro mapa?",
                            { title: "Cambios sin guardar", okText: "Guardar" }
                        );
                        if (wantsSave) {
                            const saved = await saveCurrentMap();
                            if (!saved) return;
                        }
                    }
                    const qs = `?id=${m.id}`;
                    history.replaceState({}, "", CFG.editorUrl + qs);
                    await loadOrCreate();
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

// ─────────────────────────────────────────────────────────────
// Load / Save / Delete map
// ─────────────────────────────────────────────────────────────
async function loadOrCreate() {
    const qs = getQuery();
    const id = qs.get("id");

    if (id) {
        try {
            const data = await apiLoadMap(id);
            map = {
                id: data.id,
                name: data.name || "",
                width: data.width || 1920,
                height: data.height || 1080,
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
            return;
        } catch (err) {
            console.error("Error al cargar mapa:", err);
            await Notify.error("No se pudo cargar el mapa.");
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
    if (!name) { await Notify.info("Escribe un nombre para el mapa."); return false; }

    const payload = {
        name,
        width: map.width,
        height: map.height,
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
        await Notify.error("Error al guardar el mapa.");
        return false;
    }
}

async function deleteMap() {
    if (!map?.id) return;
    const ok = await Notify.confirmDanger(
        "¿Seguro que quieres eliminar este mapa? Esta acción no se puede deshacer.",
        { title: "Eliminar mapa", okText: "Eliminar" }
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
        await Notify.error("Error al borrar el mapa.");
    }
}

async function confirmLeave() {
    if (!hasChanges()) return true;
    return await Notify.confirmDanger(
        "Tienes cambios sin guardar. ¿Quieres salir sin guardar?",
        { title: "Cambios sin guardar" }
    );
}

// ─────────────────────────────────────────────────────────────
// Modos (pan / select)
// ─────────────────────────────────────────────────────────────
function getEffectiveMode() {
    if (spaceDown) return panMode ? "select" : "pan";
    return panMode ? "pan" : "select";
}

function updatePanReadyCursor() {
    canvas.classList.toggle("is-pan-ready", getEffectiveMode() === "pan");
}

function setMode(mode) {
    panMode = mode === "pan";
    spaceDown = false;
    updatePanReadyCursor();

    const btnPanMode = $("#btnPanMode");
    const btnSelectMode = $('.tool[data-tool="select"]');

    if (btnPanMode) {
        btnPanMode.classList.toggle("is-active", panMode);
        btnPanMode.setAttribute("aria-pressed", panMode);
    }
    if (btnSelectMode) {
        btnSelectMode.classList.toggle("is-active", !panMode);
        btnSelectMode.setAttribute("aria-pressed", !panMode);
    }

    if (panMode) clearSelection();
}

// ─────────────────────────────────────────────────────────────
// Eventos principales
// ─────────────────────────────────────────────────────────────
function setupEvents() {
    // Botones de modo
    const btnPanMode = $("#btnPanMode");
    const btnSelectMode = $('.tool[data-tool="select"]');
    btnPanMode?.addEventListener("click", () => setMode("pan"));
    btnSelectMode?.addEventListener("click", () => setMode("select"));

    // Editar número
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
    setMode("pan");

    // Rastrear posición del ratón en coordenadas mundo
    canvas.addEventListener("pointermove", (e) => {
        lastWorldMouse = worldPointFromEvent(e, canvas, camera);
    }, { passive: true });

    // ─── Menú contextual (clic derecho) ───────────────
    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        lastWorldMouse = worldPointFromEvent(e, canvas, camera);

        // ¿Hay un item bajo el cursor?
        const clickedItem = e.target.closest?.(".mapItem");
        const itemId = clickedItem?.dataset.id;

        if (itemId) {
            // Asegurar que está seleccionado
            if (!selectedIds.has(itemId)) setSingleSelection(itemId);

            const it = getItemById(itemId);
            const prefix = it ? getTypePrefix(it.type) : null;

            showContextMenu(e.clientX, e.clientY, [
                { icon: "📋", label: "Copiar", action: () => copySelected() },
                { icon: "🔃", label: "Duplicar", action: () => duplicateSelected() },
                "---",
                ...(prefix ? [{
                    icon: "#️⃣", label: "Editar número",
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
                { icon: "↩", label: "Rotar izquierda", action: () => rotateSelected(-1) },
                { icon: "↪", label: "Rotar derecha", action: () => rotateSelected(1) },
                "---",
                { icon: "🗑", label: "Eliminar", danger: true, action: () => deleteSelected() },
            ]);
        } else {
            // Clic derecho en canvas vacío
            showContextMenu(e.clientX, e.clientY, [
                { icon: "📋", label: "Pegar", disabled: clipboard.length === 0, action: () => pasteClipboard() },
                {
                    icon: "☐", label: "Seleccionar todo", action: () => {
                        (map.items || []).forEach((it) => selectedIds.add(it.id));
                        updateSelectionUI();
                    }
                },
            ]);
        }
    });

    // ─── Pointerdown: pan o marquee ──────────────────────────
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const mode = getEffectiveMode();
        const clickedEmpty = e.target === canvas || e.target === world;

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
        canvas.setPointerCapture(e.pointerId);
        drawMarquee(marquee);
    });

    // ─── Pointermove: pan, drag items, marquee ───────────────
    canvas.addEventListener("pointermove", (e) => {
        // PAN
        if (panning) {
            camera.panX = panning.originX + (e.clientX - panning.startX);
            camera.panY = panning.originY + (e.clientY - panning.startY);
            clampCamera();
            applyCamera();
            return;
        }

        // DRAG de items (grupo) — con snapping corregido
        if (dragging) {
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

            // ── Snap con el nuevo sistema ────────────────────
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

            // ── Guías (múltiples por eje) ─────────────────
            showGuides(snap.guidesX, snap.guidesY);

            // ── Aplicar posición final (uniforme a todo el grupo) ──
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
            const p = worldPointFromEvent(e, canvas, camera);
            marquee.x2 = p.x;
            marquee.y2 = p.y;
            drawMarquee(marquee);
        }
    });

    // ─── Pointerup: cerrar pan / marquee ─────────────────────
    canvas.addEventListener("pointerup", (e) => {
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

        const box = normRect(marquee);
        if (!marquee.additive) selectedIds.clear();

        (map.items || []).forEach((it) => {
            const a = getAABB(it, map, it.x, it.y);
            const r = { x: a.left, y: a.top, w: a.w, h: a.h };
            if (rectsIntersect(box, r)) selectedIds.add(it.id);
        });

        marquee = null;
        hideMarquee();
        updateSelectionUI();

        suppressNextCanvasClick = true;
        setTimeout(() => { suppressNextCanvasClick = false; }, 0);
    });

    // Cancelaciones
    canvas.addEventListener("pointercancel", (e) => {
        if (panning) {
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            panning = null;
            canvas.classList.remove("is-panning");
        }
        if (marquee) {
            try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            marquee = null;
            hideMarquee();
        }
    });

    // Click en vacío: deseleccionar
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
                "Tienes cambios sin guardar. ¿Quieres guardarlos antes de crear un mapa nuevo?",
                { title: "Cambios sin guardar", okText: "Guardar" }
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

    // ─── Picker Resolución ───────────────────────────────────
    const btnResPicker = $("#btnResPicker");
    const resPickerDrop = $("#resPickerDrop");

    function setResLabel(w, h) {
        if (btnResPicker) btnResPicker.textContent = `${w} × ${h} ▾`;
        $$(".picker__item", resPickerDrop).forEach((b) => {
            b.classList.toggle("is-active", b.dataset.value === `${w}x${h}`);
        });
    }

    function openRes(open) {
        if (!resPickerDrop) return;
        resPickerDrop.classList.toggle("is-open", open);
        resPickerDrop.setAttribute("aria-hidden", open ? "false" : "true");
        const resPicker = $("#resPicker");
        if (resPicker) resPicker.classList.toggle("is-drop-open", open);
    }

    btnResPicker?.addEventListener("click", (e) => {
        e.stopPropagation();
        openRes(!resPickerDrop.classList.contains("is-open"));
    });

    document.addEventListener("click", () => openRes(false));

    resPickerDrop?.addEventListener("click", (e) => {
        const item = e.target.closest(".picker__item");
        if (!item) return;
        const [w, h] = item.dataset.value.split("x").map(Number);
        map.width = w;
        map.height = h;
        setWorldSize();
        applyItemScale();
        fitToScreen();
        afterAnyChange();
        setResLabel(w, h);
        openRes(false);
    });

    setResLabel(map?.width || 1920, map?.height || 1080);
}

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
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

        // Ctrl + Space → cambio permanente de modo
        if (e.ctrlKey || e.metaKey) {
            setMode(panMode ? "select" : "pan");
            return;
        }

        // Space solo → inversión temporal mientras se mantiene
        if (!spaceDown) {
            spaceDown = true;
            updatePanReadyCursor();
        }
    });

    window.addEventListener("keyup", (e) => {
        if (e.code !== "Space") return;
        spaceDown = false;
        updatePanReadyCursor();
    });

    // Atajos de teclado (cuando no se está en input)
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

// ES modules se ejecutan después del parsing del DOM (deferred),
// pero usamos DOMContentLoaded por seguridad.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
