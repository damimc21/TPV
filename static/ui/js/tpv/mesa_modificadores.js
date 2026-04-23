/**
 * Gestión de modificadores (comentarios y suplementos) rápidos desde el sidebar.
 * 
 * Dos modos según la opción "Modificadores acumulables" en Opciones TPV:
 *   - ACUMULABLE (ON):  Cada click suma x1; botón − para restar.
 *   - NO ACUMULABLE (OFF): Funciona como toggle on/off.
 */

function initModalModificadoresRapido() {
    const modal = document.getElementById('modalModificadoresRapido');
    if (!modal) return;

    const btnCerrar = document.getElementById('btnCerrarModifRapido');
    const btnCancelar = document.getElementById('btnCancelarModifRapido');

    if (btnCerrar) btnCerrar.onclick = () => modal.classList.add('hidden');
    if (btnCancelar) btnCancelar.onclick = () => modal.classList.add('hidden');
}

/** Lee la preferencia de acumulación del localStorage */
function esModifAcumulable() {
    return localStorage.getItem('tpv_modif_acumulable') === '1';
}

/** Cuenta cuántas veces aparece un modificador en una línea */
function contarModificadorEnLinea(linea, type, nombre) {
    if (!linea.configuracion_json || !linea.configuracion_json.manual_additions) return 0;
    return linea.configuracion_json.manual_additions.filter(m => {
        if (type === 'text') return m.type === 'text' && m.val === nombre;
        if (type === 'price') return m.type === 'price' && m.nombre === nombre;
        return false;
    }).length;
}

/** Cantidad mínima entre todas las líneas seleccionadas */
function cantidadMinimaModificador(lineas, type, nombre) {
    if (lineas.length === 0) return 0;
    return Math.min(...lineas.map(l => contarModificadorEnLinea(l, type, nombre)));
}

/**
 * Abre el modal de modificadores para las líneas seleccionadas.
 */
async function abrirModificadoresRapido(filterType = null) {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;

    const linea = seleccionadas[0];
    const prodId = Number(linea.producto_id);
    const prod = tpvState.productos.find(p => Number(p.id) === prodId);
    
    if (!prod) {
        console.error("Producto no encontrado en el catálogo:", prodId);
        return;
    }

    const modal = document.getElementById('modalModificadoresRapido');
    const body = document.getElementById('modalModifRapidoBody');
    if (!modal || !body) return;

    modal._filterType = filterType;
    modal._prodId = prodId;

    renderModificadoresBody(body, seleccionadas, prod, filterType);
    modal.classList.remove('hidden');
}

/**
 * Renderiza el contenido del modal según modo acumulable o toggle.
 */
function renderModificadoresBody(body, seleccionadas, prod, filterType) {
    const deptoId = prod.departamento ? Number(prod.departamento) : null;
    const depto = deptoId ? tpvState.departamentos.find(d => Number(d.id) === deptoId) : null;
    const acumulable = esModifAcumulable();

    const idsComentarios = [...new Set([
        ...(prod.perfiles_comentarios || []).map(Number),
        ...(depto?.perfiles_comentarios || []).map(Number)
    ])];
    const idsSuplementos = [...new Set([
        ...(prod.perfiles_suplementos || []).map(Number),
        ...(depto?.perfiles_suplementos || []).map(Number)
    ])];

    const perfilesComent = (tpvState.perfilesComentarios || []).filter(p => idsComentarios.includes(Number(p.id)));
    const perfilesSup = (tpvState.perfilesSuplementos || []).filter(p => idsSuplementos.includes(Number(p.id)));

    let html = '';

    // ── Comentarios ──
    if (filterType === 'comentario' || !filterType) {
        html += `<div class="config-section">
            <div class="config-section__title">💬 ${gettext('Comentarios rápidos')}</div>
            <div class="config-chips">`;
        
        perfilesComent.forEach(p => {
            (p.comentarios || []).forEach(c => {
                if (c.texto === '__MANUAL_TEXT__') {
                    html += `<button type="button" class="config-chip config-chip--quick" 
                                onclick="aplicarModificadorRapido('comentario_manual')">
                        <span class="config-chip__name">${getDisplayModifierName(c.texto)}</span>
                    </button>`;
                    return;
                }

                const qty = cantidadMinimaModificador(seleccionadas, 'text', c.texto);
                const isActive = qty > 0;
                const selectedClass = isActive ? 'is-selected' : '';
                const textoEscaped = c.texto.replace(/'/g, "\\'");

                if (acumulable) {
                    // Modo acumulable: click suma, botón − resta
                    const badgeHtml = qty > 1 ? `<span class="config-chip__badge">x${qty}</span>` : '';
                    const minusHtml = isActive 
                        ? `<span class="config-chip__minus" onclick="event.stopPropagation(); quitarModificadorRapido('comentario', '${textoEscaped}')">−</span>` 
                        : '';
                    html += `<button type="button" class="config-chip config-chip--quick ${selectedClass}" 
                                onclick="agregarModificadorRapido('comentario', '${textoEscaped}')">
                        ${minusHtml}
                        <span class="config-chip__name">${getDisplayModifierName(c.texto)}</span>
                        ${badgeHtml}
                    </button>`;
                } else {
                    // Modo toggle: click alterna on/off
                    html += `<button type="button" class="config-chip config-chip--quick ${selectedClass}" 
                                onclick="toggleModificadorRapido('comentario', '${textoEscaped}')">
                        <span class="config-chip__name">${getDisplayModifierName(c.texto)}</span>
                    </button>`;
                }
            });
        });
        html += `</div></div>`;
    }

    // ── Suplementos ──
    if (filterType === 'suplemento' || !filterType) {
        html += `<div class="config-section">
            <div class="config-section__title">➕ ${gettext('Suplementos')}</div>
            <div class="config-chips">`;

        perfilesSup.forEach(p => {
            (p.suplementos || []).forEach(s => {
                if (s.nombre === '__MANUAL_PRICE__') {
                    html += `<button type="button" class="config-chip config-chip--quick" 
                                onclick="aplicarModificadorRapido('suplemento_manual')">
                        <span class="config-chip__name">${getDisplayModifierName(s.nombre)}</span>
                    </button>`;
                    return;
                }

                const qty = cantidadMinimaModificador(seleccionadas, 'price', s.nombre);
                const isActive = qty > 0;
                const selectedClass = isActive ? 'is-selected' : '';
                const nombreEscaped = s.nombre.replace(/'/g, "\\'");

                if (acumulable) {
                    const badgeHtml = qty > 1 ? `<span class="config-chip__badge">x${qty}</span>` : '';
                    const minusHtml = isActive 
                        ? `<span class="config-chip__minus" onclick="event.stopPropagation(); quitarModificadorRapido('suplemento', '${nombreEscaped}', ${s.precio})">−</span>` 
                        : '';
                    html += `<button type="button" class="config-chip config-chip--quick ${selectedClass}" 
                                onclick="agregarModificadorRapido('suplemento', '${nombreEscaped}', ${s.precio})">
                        ${minusHtml}
                        <span class="config-chip__name">${getDisplayModifierName(s.nombre)}</span>
                        <span class="config-chip__price">+${formatPrecio(s.precio)}</span>
                        ${badgeHtml}
                    </button>`;
                } else {
                    html += `<button type="button" class="config-chip config-chip--quick ${selectedClass}" 
                                onclick="toggleModificadorRapido('suplemento', '${nombreEscaped}', ${s.precio})">
                        <span class="config-chip__name">${getDisplayModifierName(s.nombre)}</span>
                        <span class="config-chip__price">+${formatPrecio(s.precio)}</span>
                    </button>`;
                }
            });
        });
        html += `</div></div>`;
    }

    body.innerHTML = html;
}

// ── Acciones ──

/** Modo acumulable: añade una instancia más */
async function agregarModificadorRapido(type, nombre, precio = 0) {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;
    const dataType = (type === 'comentario') ? 'text' : 'price';
    await aplicarModificadorData(dataType, nombre, precio, seleccionadas);
    refrescarModalModificadores();
}

/** Modo acumulable: quita una instancia */
async function quitarModificadorRapido(type, nombre, precio = 0) {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;
    const dataType = (type === 'comentario') ? 'text' : 'price';
    await quitarModificadorData(dataType, nombre, precio, seleccionadas);
    refrescarModalModificadores();
}

/** Modo toggle: si lo tiene lo quita, si no lo tiene lo añade */
async function toggleModificadorRapido(type, nombre, precio = 0) {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;
    const dataType = (type === 'comentario') ? 'text' : 'price';
    const yaAplicado = cantidadMinimaModificador(seleccionadas, dataType, nombre) > 0;

    if (yaAplicado) {
        await quitarModificadorData(dataType, nombre, precio, seleccionadas);
    } else {
        await aplicarModificadorData(dataType, nombre, precio, seleccionadas);
    }
    refrescarModalModificadores();
}

/** Acciones manuales (texto libre, comodín) */
async function aplicarModificadorRapido(type, nombre, precio = 0) {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;

    if (type === 'comentario_manual') {
        const texto = await showManualInputModal('text', gettext('Comentario libre'));
        if (texto) {
            await aplicarModificadorData('text', texto, 0, seleccionadas);
            refrescarModalModificadores();
        }
    } else if (type === 'suplemento_manual') {
        const res = await showManualInputModal('price', gettext('Añadir suplemento'));
        if (res && res.precio) {
            await aplicarModificadorData('price', res.nombre || gettext('Suplemento'), parseFloat(res.precio), seleccionadas);
            refrescarModalModificadores();
        }
    }
}

/** Refresca el modal sin cerrarlo */
function refrescarModalModificadores() {
    const seleccionadas = getLineasSeleccionadasActivas();
    if (seleccionadas.length === 0) return;

    const modal = document.getElementById('modalModificadoresRapido');
    const body = document.getElementById('modalModifRapidoBody');
    if (!modal || !body) return;

    const prodId = modal._prodId || Number(seleccionadas[0].producto_id);
    const prod = tpvState.productos.find(p => Number(p.id) === prodId);
    if (!prod) return;

    renderModificadoresBody(body, seleccionadas, prod, modal._filterType || null);
}

// ── Helpers de datos ──

async function aplicarModificadorData(type, val, precio, lineas) {
    lineas.forEach(linea => {
        if (!linea.configuracion_json) {
            linea.configuracion_json = { grupos: [], manual_additions: [] };
        }
        if (!linea.configuracion_json.manual_additions) {
            linea.configuracion_json.manual_additions = [];
        }

        linea.configuracion_json.manual_additions.push({
            type: type,
            nombre: type === 'price' ? val : null,
            val: type === 'price' ? precio.toFixed(2) : val
        });

        if (type === 'price') {
            linea.precio_unitario += precio;
            recalcularLinea(linea);
        }
    });

    renderTicket();
    saveHistoryState();
    await sincronizarComanda();
}

async function quitarModificadorData(type, nombre, precio, lineas) {
    lineas.forEach(linea => {
        if (!linea.configuracion_json || !linea.configuracion_json.manual_additions) return;

        const additions = linea.configuracion_json.manual_additions;
        const idx = additions.findIndex(m => {
            if (type === 'text') return m.type === 'text' && m.val === nombre;
            if (type === 'price') return m.type === 'price' && m.nombre === nombre;
            return false;
        });

        if (idx !== -1) {
            const removed = additions.splice(idx, 1)[0];
            if (removed.type === 'price' && removed.val) {
                linea.precio_unitario -= parseFloat(removed.val);
                recalcularLinea(linea);
            }
        }

        if (additions.length === 0 && 
            (!linea.configuracion_json.grupos || linea.configuracion_json.grupos.length === 0)) {
            linea.configuracion_json = null;
        }
    });

    renderTicket();
    saveHistoryState();
    await sincronizarComanda();
}

document.addEventListener('DOMContentLoaded', initModalModificadoresRapido);
