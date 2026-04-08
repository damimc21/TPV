// ============================================================
// Producto Configurable: Modal de configuración en el TPV
// ============================================================

// Cache de plantillas para no hacer fetch repetidos
const plantillaCache = {};

/**
 * Abre el modal de configuración para un producto configurable.
 * @param {Object} prod - El objeto producto del catálogo
 * @param {Object|null} lineaExistente - Si se está editando una línea ya existente
 */
async function abrirModalConfigurable(prod, lineaExistente = null) {
    const modal = document.getElementById('modalConfigurable');
    if (!modal) return;

    // Cargar plantilla (con cache)
    let plantilla;
    try {
        plantilla = await obtenerPlantilla(prod.id);
    } catch (e) {
        console.error('Error cargando plantilla:', e);
        // Fallback: añadir como producto normal
        agregarLineaComandaNormal(prod);
        return;
    }

    // Guardar contexto
    modal._prod = prod;
    modal._plantilla = plantilla;
    modal._lineaExistente = lineaExistente;
    modal._configActual = lineaExistente ? JSON.parse(JSON.stringify(lineaExistente.configuracion_json)) : null;

    renderModalConfigurable(modal, prod, plantilla, modal._configActual);
    modal.classList.remove('hidden');
}

/**
 * Obtiene la plantilla de un producto configurable (con cache).
 */
async function obtenerPlantilla(productoId) {
    // Eliminamos el uso de cache temporalmente para asegurar que los cambios de precios se vean al instante
    // if (plantillaCache[productoId]) return plantillaCache[productoId];

    const resp = await fetch(`/api/productos/${productoId}/plantilla/`, {
        headers: { 'X-CSRFToken': getCSRFToken() }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    plantillaCache[productoId] = data;
    return data;
}

/**
 * Renderiza el contenido completo del modal de configuración.
 */
function renderModalConfigurable(modal, prod, plantilla, configExistente) {
    const titulo = modal.querySelector('#configModalTitle');
    const body = modal.querySelector('#configModalBody');
    const btnAdd = modal.querySelector('#btnConfigAnadir');

    titulo.textContent = configExistente ? `Editar: ${prod.nombre}` : prod.nombre;
    btnAdd.textContent = configExistente ? 'Guardar' : 'Añadir';

    let html = '';

    // ── Selector de Formato ──
    if (plantilla.tiene_formatos && plantilla.formatos.length > 0) {
        const formatoActual = configExistente?.formato_id
            || plantilla.formatos.find(f => f.por_defecto)?.id
            || plantilla.formatos[0].id;

        html += `<div class="config-section">
            <div class="config-section__title">Formato</div>
            <div class="config-chips config-chips--formato">`;

        plantilla.formatos.forEach(f => {
            const hasFixed = f.precio_fijo !== null && f.precio_fijo !== undefined && f.precio_fijo !== '';
            const precio = hasFixed ? parseFloat(f.precio_fijo) : (parseFloat(prod.precio) * parseFloat(f.factor_precio));
            const selected = f.id === formatoActual ? 'is-selected' : '';
            html += `<button type="button" class="config-chip config-chip--formato ${selected}"
                        data-formato-id="${f.id}" data-factor="${f.factor_precio}" data-precio-fijo="${f.precio_fijo}">
                        <span class="config-chip__name">${f.nombre}</span>
                        <span class="config-chip__price">${formatPrecio(precio)}</span>
                    </button>`;
        });

        html += `</div></div>`;
    }

    // ── Grupos de Opciones ──
    if (plantilla.grupos && plantilla.grupos.length > 0) {
        plantilla.grupos.forEach(grupo => {
            const grupoConfig = configExistente?.grupos?.find(g => g.grupo_id === grupo.id);
            const seleccionadas = grupoConfig ? grupoConfig.opciones.map(o => o.opcion_id) : [];
            const textoLibre = grupoConfig?.texto_libre || '';

            html += `<div class="config-section" data-grupo-id="${grupo.id}">
                <div class="config-section__title">${grupo.nombre}
                    ${grupo.obligatorio ? '<span class="config-required">*</span>' : ''}
                </div>
                <div class="config-chips" data-tipo="${grupo.tipo_seleccion}">`;

            grupo.opciones.filter(o => o.activo).forEach(opcion => {
                let selected = '';
                if (configExistente) {
                    selected = seleccionadas.includes(opcion.id) ? 'is-selected' : '';
                } else {
                    // Si es nuevo, usamos el flag por_defecto
                    selected = opcion.por_defecto ? 'is-selected' : '';
                }

                const precioStr = parseFloat(opcion.precio_base) > 0 ? `+${formatPrecio(opcion.precio_base)}` : '';

                html += `<button type="button" class="config-chip ${selected}"
                            data-opcion-id="${opcion.id}" data-grupo-id="${grupo.id}"
                            data-precio-base="${opcion.precio_base}"
                            data-tipo="${grupo.tipo_seleccion}"
                            data-obligatorio="${grupo.obligatorio ? '1' : '0'}">
                            <span class="config-chip__name">${opcion.nombre}</span>
                            <span class="config-chip__price"></span>
                        </button>`;
            });

            html += `</div>`;

            // Campo de texto libre
            if (grupo.permite_texto_libre) {
                html += `<div class="config-texto-libre">
                    <input type="text" class="config-input" placeholder="Comentario libre..."
                        data-grupo-id="${grupo.id}" value="${textoLibre}" autocomplete="off">
                </div>`;
            }

            html += `</div>`;
        });
    }

    // ── Precio Total ──
    html += `<div class="config-total">
        <span class="config-total__label">Total:</span>
        <span class="config-total__value" id="configPrecioTotal">0,00 €</span>
    </div>`;

    body.innerHTML = html;

    // ── Bindings ──
    bindChipEvents(modal, prod, plantilla);
    recalcularPrecioConfigurable(modal, prod, plantilla);
}

/**
 * Enlaza eventos de click en los chips.
 */
function bindChipEvents(modal, prod, plantilla) {
    const body = modal.querySelector('#configModalBody');

    body.querySelectorAll('.config-chip:not(.config-chip--formato)').forEach(chip => {
        chip.addEventListener('click', () => {
            const container = chip.closest('.config-chips');
            const tipo = (chip.dataset.tipo || container?.dataset.tipo || '').trim().toLowerCase();
            const grupoId = chip.dataset.grupoId;
            const esObligatorio = chip.dataset.obligatorio === '1';
            const yaSeleccionado = chip.classList.contains('is-selected');

            const esUnica = (tipo === 'unica' || tipo === 'single' || tipo === 'unico');

            if (esUnica) {
                if (yaSeleccionado && esObligatorio) {
                    return; // No permitir deseleccionar el único elemento obligatorio
                }
                
                // Deseleccionar todos los demás del mismo grupo
                body.querySelectorAll(`.config-chip[data-grupo-id="${grupoId}"]`).forEach(c => {
                    c.classList.remove('is-selected');
                });
                
                // Si ya estaba seleccionado y NO es obligatorio, lo quitamos (toggle).
                // Si NO estaba seleccionado, lo ponemos.
                if (yaSeleccionado && !esObligatorio) {
                    chip.classList.remove('is-selected');
                } else {
                    chip.classList.add('is-selected');
                }
            } else {
                chip.classList.toggle('is-selected');
            }
            
            // Quitar marca de error si se ha seleccionado algo
            const grupoSection = chip.closest('.config-section');
            if (grupoSection) grupoSection.classList.remove('config-section--error');

            recalcularPrecioConfigurable(modal, prod, plantilla);
        });
    });

    body.querySelectorAll('.config-chip--formato').forEach(chip => {
        chip.addEventListener('click', () => {
            body.querySelectorAll('.config-chip--formato').forEach(c => c.classList.remove('is-selected'));
            chip.classList.add('is-selected');
            recalcularPrecioConfigurable(modal, prod, plantilla);
        });
    });
}

/**
 * Calcula el precio total según formato + opciones seleccionadas.
 */
function recalcularPrecioConfigurable(modal, prod, plantilla) {
    const body = modal.querySelector('#configModalBody');
    let total = 0;

    // Precio del formato
    const formatoChip = body.querySelector('.config-chip--formato.is-selected');
    let factor = 1;
    if (formatoChip) {
        const pFijo = formatoChip.dataset.precioFijo;
        factor = parseFloat(formatoChip.dataset.factor) || 1;
        if (pFijo && pFijo !== 'null' && pFijo !== '') {
            total += parseFloat(pFijo);
        } else {
            total += parseFloat(prod.precio) * factor;
        }
    } else {
        total += parseFloat(prod.precio);
    }

    const formatoId = formatoChip ? parseInt(formatoChip.dataset.formatoId) : null;
    const allOptionChips = body.querySelectorAll('.config-chip:not(.config-chip--formato)');
    
    allOptionChips.forEach(chip => {
        const opcionId = parseInt(chip.dataset.opcionId);
        const precioBase = parseFloat(chip.dataset.precioBase) || 0;
        const yaSeleccionado = chip.classList.contains('is-selected');

        // Buscar precio dinámico
        let precioDinamic = precioBase;
        if (formatoId && plantilla.grupos) {
            for (const grupo of plantilla.grupos) {
                const opcion = grupo.opciones.find(o => o.id === opcionId);
                if (opcion) {
                    const precioFormato = opcion.precios_formato?.find(pf => pf.formato === formatoId);
                    if (precioFormato) {
                        precioDinamic = parseFloat(precioFormato.precio);
                    } else {
                        precioDinamic = precioBase * factor;
                    }
                    break;
                }
            }
        }

        // Actualizar etiqueta visual
        const priceLabel = chip.querySelector('.config-chip__price');
        if (priceLabel) {
            if (precioDinamic > 0) {
                priceLabel.textContent = `+${formatPrecio(precioDinamic)}`;
                priceLabel.style.display = '';
            } else {
                priceLabel.textContent = '';
                priceLabel.style.display = 'none';
            }
        }

        // Si está seleccionado, sumar al total
        if (yaSeleccionado) {
            total += precioDinamic;
        }
    });

    const el = modal.querySelector('#configPrecioTotal');
    if (el) el.textContent = formatPrecio(total);
    modal._precioCalculado = total;
}

/**
 * Construye el JSON de configuración a partir del estado actual del modal.
 */
function construirConfigJSON(modal, prod, plantilla) {
    const body = modal.querySelector('#configModalBody');
    const config = { grupos: [] };

    // Formato
    const formatoChip = body.querySelector('.config-chip--formato.is-selected');
    if (formatoChip) {
        const formatoId = parseInt(formatoChip.dataset.formatoId);
        const formato = plantilla.formatos.find(f => f.id === formatoId);
        const precioFijo = formatoChip.dataset.precioFijo;
        let precioFormato;
        if (precioFijo && precioFijo !== 'null') {
            precioFormato = precioFijo;
        } else {
            precioFormato = (parseFloat(prod.precio) * parseFloat(formatoChip.dataset.factor)).toFixed(2);
        }
        config.formato_id = formatoId;
        config.formato_nombre = formato ? formato.nombre : '';
        config.precio_formato = precioFormato;
    }

    // Grupos
    const factor = formatoChip ? parseFloat(formatoChip.dataset.factor) || 1 : 1;
    const formatoId = formatoChip ? parseInt(formatoChip.dataset.formatoId) : null;

    if (plantilla.grupos) {
        plantilla.grupos.forEach(grupo => {
            const grupoSection = body.querySelector(`.config-section[data-grupo-id="${grupo.id}"]`);
            if (!grupoSection) return;

            const opcionesSeleccionadas = [];
            grupoSection.querySelectorAll('.config-chip.is-selected:not(.config-chip--formato)').forEach(chip => {
                const opcionId = parseInt(chip.dataset.opcionId);
                const precioBase = parseFloat(chip.dataset.precioBase) || 0;
                const opcionData = grupo.opciones.find(o => o.id === opcionId);

                let precioFinal = precioBase;
                if (formatoId && opcionData) {
                    const pf = opcionData.precios_formato?.find(p => p.formato === formatoId);
                    if (pf) {
                        precioFinal = parseFloat(pf.precio);
                    } else {
                        precioFinal = precioBase * factor;
                    }
                }

                opcionesSeleccionadas.push({
                    opcion_id: opcionId,
                    nombre: opcionData ? opcionData.nombre : '',
                    precio: precioFinal.toFixed(2),
                    visible_comanda: opcionData ? opcionData.visible_comanda : true,
                    visible_factura: opcionData ? opcionData.visible_factura : true
                });
            });

            const textoInput = grupoSection.querySelector('.config-input');
            const textoLibre = textoInput ? textoInput.value.trim() : '';

            if (opcionesSeleccionadas.length > 0 || textoLibre) {
                config.grupos.push({
                    grupo_id: grupo.id,
                    nombre: grupo.nombre,
                    opciones: opcionesSeleccionadas,
                    ...(textoLibre && { texto_libre: textoLibre })
                });
            }
        });
    }

    return config;
}

/**
 * Confirma la configuración y añade/actualiza la línea en el ticket.
 */
async function confirmarConfigurable() {
    const modal = document.getElementById('modalConfigurable');
    if (!modal) return;

    const prod = modal._prod;
    const plantilla = modal._plantilla;
    const lineaExistente = modal._lineaExistente;

    // VALIDACIÓN: Grupos obligatorios
    let errores = 0;
    const body = modal.querySelector('#configModalBody');
    if (plantilla.grupos) {
        plantilla.grupos.forEach(grupo => {
            if (grupo.obligatorio) {
                const grpEl = body.querySelector(`.config-section[data-grupo-id="${grupo.id}"]`);
                const seleccionadas = grpEl.querySelectorAll('.config-chip.is-selected').length;
                const textoLibre = grpEl.querySelector('.config-input')?.value.trim();
                
                if (seleccionadas === 0 && !textoLibre) {
                    grpEl.classList.add('config-section--error');
                    errores++;
                }
            }
        });
    }

    if (errores > 0) {
        // Podríamos mostrar un mensaje más explícito aquí
        showAlerta('Configuración incompleta', 'Debes seleccionar las opciones obligatorias marcadas con *');
        return;
    }

    const config = construirConfigJSON(modal, prod, plantilla);
    const precioTotal = modal._precioCalculado || parseFloat(prod.precio);

    // Construir nombre con formato
    let nombreMostrar = prod.nombre;
    if (config.formato_nombre) {
        nombreMostrar = `${prod.nombre} (${config.formato_nombre})`;
    }

    if (lineaExistente) {
        // ── EDITAR línea existente ──
        const idx = tpvState.lineas.findIndex(l => l._uid === lineaExistente._uid);
        if (idx !== -1) {
            tpvState.lineas[idx].precio_unitario = precioTotal;
            tpvState.lineas[idx].producto_nombre = nombreMostrar;
            tpvState.lineas[idx].configuracion_json = config;
            recalcularLinea(tpvState.lineas[idx]);
        }
    } else {
        // ── NUEVA línea ──
        const nuevaLinea = {
            id: null,
            _uid: `l_${tpvState.nextLineaUid++}`,
            producto_id: prod.id,
            producto_nombre: nombreMostrar,
            cantidad: 1,
            precio_unitario: precioTotal,
            descuento: 0,
            anulado: false,
            configuracion_json: config
        };
        recalcularLinea(nuevaLinea);
        tpvState.lineas.push(nuevaLinea);
        tpvState.historialInserciones.push(prod.id);
    }

    cerrarModalConfigurable();
    renderTicket();
    saveHistoryState();
    await sincronizarComanda();
}

/**
 * Cierra el modal de configuración.
 */
function cerrarModalConfigurable() {
    const modal = document.getElementById('modalConfigurable');
    if (modal) {
        modal.classList.add('hidden');
        modal._prod = null;
        modal._plantilla = null;
        modal._lineaExistente = null;
        modal._configActual = null;
        modal._precioCalculado = null;
    }
}
