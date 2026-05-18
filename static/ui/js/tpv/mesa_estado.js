// Estado global del TPV y utilidades de gestión de líneas

const tpvState = {
    mesaId: null,
    mesaNumero: window.MESA_NUMERO || null,
    comandaId: null,
    departamentos: [],
    productos: [],
    deptoActivo: null,
    lineas: [],
    isInitialLoading: true,
    lineaSeleccionadaIndex: null,
    lineasSeleccionadas: new Set(),
    nextLineaUid: 1,
    historialInserciones: [],
    historyStack: [],
    historyIndex: -1,
    clienteId: null,
    clienteNombre: null,
    operadorId: null,
    operadorNombre: null
};

function asegurarLineaUid(linea) {
    if (!linea._uid) {
        linea._uid = `l_${tpvState.nextLineaUid++}`;
    }
    return linea._uid;
}

function rehidratarLineas(lineas) {
    lineas.forEach(asegurarLineaUid);
}

function limpiarSeleccionLineas() {
    tpvState.lineasSeleccionadas.clear();
    tpvState.lineaSeleccionadaIndex = null;
}

function getLineasSeleccionadasActivas() {
    return tpvState.lineas.filter(l => !l.anulado && tpvState.lineasSeleccionadas.has(asegurarLineaUid(l)));
}

function toggleLineaSeleccion(linea) {
    const uid = asegurarLineaUid(linea);
    if (tpvState.lineasSeleccionadas.has(uid)) {
        tpvState.lineasSeleccionadas.delete(uid);
    } else {
        tpvState.lineasSeleccionadas.add(uid);
    }
    const idx = tpvState.lineas.findIndex(l => l === linea);
    tpvState.lineaSeleccionadaIndex = idx >= 0 ? idx : null;
}

function estaLineaSeleccionada(linea) {
    return tpvState.lineasSeleccionadas.has(asegurarLineaUid(linea));
}

// Recalcula el total de una línea (cantidad × precio − descuento)
function recalcularLinea(linea) {
    const subtotal = Number(linea.cantidad) * Number(linea.precio_unitario);
    const descPct = Number(linea.descuento || 0);
    linea.total = subtotal * (1 - descPct / 100);
}

// Elimina una línea del ticket por su índice
function eliminarLineaPorIndice(index) {
    if (index < 0 || index >= tpvState.lineas.length) return;
    const linea = tpvState.lineas[index];
    const uid = linea._uid;
    tpvState.lineas.splice(index, 1);
    if (uid) tpvState.lineasSeleccionadas.delete(uid);
    if (tpvState.lineaSeleccionadaIndex === index) tpvState.lineaSeleccionadaIndex = null;
    const hIndex = tpvState.historialInserciones.lastIndexOf(linea.producto_id);
    if (hIndex !== -1) tpvState.historialInserciones.splice(hIndex, 1);
}

// Cambia el texto del modal de mesa según el modo (abrir o traspasar)
function actualizarModalMesa(modo = "mesa") {
    const title = document.getElementById("modalMesaTitle");
    const goBtn = document.getElementById("btnGoModalMesa");
    if (title) title.textContent = modo === "traspasar" ? "Traspasar a mesa" : "Seleccionar Mesa";
    if (goBtn) goBtn.textContent = modo === "traspasar" ? "Traspasar" : "Ir a la mesa";
}
