/* snapping.js — Lógica de magnetismo/snapping corregida (v2)

   Cambios v2:
   - Edge-to-edge ahora funciona en TODAS las direcciones (sin requisito de overlap)
   - Devuelve múltiples guías por eje para mostrar ambas líneas simultáneamente
   - Corner snap con restricción de distancia
   - cornerTh escala con zoom correctamente
   - Acumula candidatos y elige el más cercano (no "último gana")
*/

import { overlap1D, snapToGrid, SNAP_THRESHOLD, SNAP_OVERLAP_MIN, SNAP_CORNER_THRESHOLD } from './utils.js';
import { getAABB } from './geometry.js';

// ─── Helpers internos ────────────────────────────────────────

/** Registra un candidato de snap si la distancia está dentro del umbral */
function addCandidate(list, currentEdge, targetEdge, threshold, guidePos, isCenter = false) {
    const dist = Math.abs(currentEdge - targetEdge);
    if (dist < threshold) {
        list.push({
            delta: targetEdge - currentEdge,
            dist,
            guide: guidePos,
            isCenter,
        });
    }
}

/** Devuelve el candidato con menor distancia, o null */
function selectBest(candidates) {
    if (candidates.length === 0) return null;
    return candidates.reduce((best, c) => c.dist < best.dist ? c : best);
}

/**
 * Devuelve las posiciones de guía únicas que coinciden con el
 * mejor delta seleccionado. Filtra guías de centro si ya hay
 * guías de borde (evita 3 líneas redundantes en items iguales).
 */
function collectGuides(candidates, bestDelta, epsilon = 0.5) {
    if (candidates.length === 0) return [];

    const edgeGuides = new Set();
    const centerGuides = new Set();

    for (const c of candidates) {
        if (Math.abs(c.delta - bestDelta) < epsilon && c.guide !== null) {
            if (c.isCenter) centerGuides.add(c.guide);
            else edgeGuides.add(c.guide);
        }
    }

    // Si hay 2+ guías de borde, no mostrar las de centro (redundante)
    if (edgeGuides.size >= 2) return [...edgeGuides];

    // Si no, incluir todo
    return [...edgeGuides, ...centerGuides];
}

// ─── Función principal ───────────────────────────────────────

/**
 * Calcula los deltas de snap para un grupo de items siendo arrastrados.
 *
 * @param {Array<{item, targetX, targetY}>} movedItems
 * @param {Array}  otherItems
 * @param {Object} map
 * @param {Object} opts - { zoom, useGrid }
 * @returns {{
 *   dx: number, dy: number,
 *   guidesX: number[], guidesY: number[]
 * }}
 */
export function computeSnap(movedItems, otherItems, map, opts = {}) {
    const { zoom = 1, useGrid = false } = opts;

    const worldW = map.width || 1920;
    const worldH = map.height || 1080;

    // Umbrales en coordenadas mundo (escalados por zoom)
    const snapTh = SNAP_THRESHOLD / zoom;
    const cornerTh = SNAP_CORNER_THRESHOLD / zoom;
    const overlapMin = SNAP_OVERLAP_MIN / zoom;

    const xCandidates = [];
    const yCandidates = [];

    // ── Recorrer cada item movido ────────────────────────────
    for (const { item, targetX, targetY } of movedItems) {
        const aThis = getAABB(item, map, targetX, targetY);

        // ── Snap a bordes del mapa ──
        addCandidate(xCandidates, aThis.left, 0, snapTh, 0);
        addCandidate(xCandidates, aThis.right, worldW, snapTh, worldW);
        addCandidate(yCandidates, aThis.top, 0, snapTh, 0);
        addCandidate(yCandidates, aThis.bottom, worldH, snapTh, worldH);

        // ── Snap contra cada item no movido ──
        for (const other of otherItems) {
            const aOther = getAABB(other, map);

            const otherCX = (aOther.left + aOther.right) / 2;
            const otherCY = (aOther.top + aOther.bottom) / 2;
            const thisCX = (aThis.left + aThis.right) / 2;
            const thisCY = (aThis.top + aThis.bottom) / 2;

            // ── Edge-to-edge X (las 4 direcciones, SIN requisito de overlap) ──
            // right→left: mi borde derecho toca su borde izquierdo
            addCandidate(xCandidates, aThis.right, aOther.left, snapTh, aOther.left);
            // left→right: mi borde izquierdo toca su borde derecho
            addCandidate(xCandidates, aThis.left, aOther.right, snapTh, aOther.right);

            // ── Edge-to-edge Y (las 4 direcciones, SIN requisito de overlap) ──
            // bottom→top: mi borde inferior toca su borde superior
            addCandidate(yCandidates, aThis.bottom, aOther.top, snapTh, aOther.top);
            // top→bottom: mi borde superior toca su borde inferior
            addCandidate(yCandidates, aThis.top, aOther.bottom, snapTh, aOther.bottom);

            // ── Alineación X: left / center / right ──
            addCandidate(xCandidates, aThis.left, aOther.left, snapTh, aOther.left);
            addCandidate(xCandidates, thisCX, otherCX, snapTh, otherCX, true);  // centro
            addCandidate(xCandidates, aThis.right, aOther.right, snapTh, aOther.right);

            // ── Alineación Y: top / center / bottom ──
            addCandidate(yCandidates, aThis.top, aOther.top, snapTh, aOther.top);
            addCandidate(yCandidates, thisCY, otherCY, snapTh, otherCY, true);  // centro
            addCandidate(yCandidates, aThis.bottom, aOther.bottom, snapTh, aOther.bottom);

            // ── Corner snaps (requiere AMBOS ejes dentro del umbral) ──
            const cornerPairs = [
                { dx: aThis.right - aOther.left, dy: aThis.bottom - aOther.top, gx: aOther.left, gy: aOther.top },
                { dx: aThis.right - aOther.left, dy: aThis.top - aOther.bottom, gx: aOther.left, gy: aOther.bottom },
                { dx: aThis.left - aOther.right, dy: aThis.bottom - aOther.top, gx: aOther.right, gy: aOther.top },
                { dx: aThis.left - aOther.right, dy: aThis.top - aOther.bottom, gx: aOther.right, gy: aOther.bottom },
            ];

            for (const cp of cornerPairs) {
                const absDx = Math.abs(cp.dx);
                const absDy = Math.abs(cp.dy);

                if (absDx < cornerTh && absDy < cornerTh) {
                    xCandidates.push({ delta: -cp.dx, dist: absDx, guide: cp.gx });
                    yCandidates.push({ delta: -cp.dy, dist: absDy, guide: cp.gy });
                }
            }
        }
    }

    // ── Elegir el mejor candidato por eje ─────────────────────
    let bestX = selectBest(xCandidates);
    let bestY = selectBest(yCandidates);

    // ── Grid snap: solo si no hubo magnet snap en ese eje ─────
    if (useGrid) {
        if (!bestX && movedItems.length > 0) {
            const ref = movedItems[0];
            const aRef = getAABB(ref.item, map, ref.targetX, ref.targetY);
            const gridLeft = snapToGrid(aRef.left);
            const gridDelta = gridLeft - aRef.left;
            if (gridDelta !== 0) {
                bestX = { delta: gridDelta, dist: Math.abs(gridDelta), guide: null };
            }
        }

        if (!bestY && movedItems.length > 0) {
            const ref = movedItems[0];
            const aRef = getAABB(ref.item, map, ref.targetX, ref.targetY);
            const gridTop = snapToGrid(aRef.top);
            const gridDelta = gridTop - aRef.top;
            if (gridDelta !== 0) {
                bestY = { delta: gridDelta, dist: Math.abs(gridDelta), guide: null };
            }
        }
    }

    // ── Recopilar TODAS las guías que coinciden con el delta elegido ──
    const guidesX = bestX ? collectGuides(xCandidates, bestX.delta) : [];
    const guidesY = bestY ? collectGuides(yCandidates, bestY.delta) : [];

    return {
        dx: bestX ? bestX.delta : 0,
        dy: bestY ? bestY.delta : 0,
        guidesX,
        guidesY,
    };
}
