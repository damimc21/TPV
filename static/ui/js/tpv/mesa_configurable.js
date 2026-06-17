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

    // Inicializar lista de añadidos manuales (Comentarios libres / Comodines múltiples)
    modal._manualAdditions = [];
    if (modal._configActual && modal._configActual.manual_additions) {
        modal._manualAdditions = [...modal._configActual.manual_additions];
    }

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
    const sidebarName = modal.querySelector('#configSidebarName');

    if (titulo) titulo.textContent = configExistente ? `Editar: ${prod.nombre}` : 'Selecciona Opciones';
    if (sidebarName) sidebarName.textContent = prod.nombre;
    if (btnAdd) btnAdd.textContent = configExistente ? 'Guardar Cambios' : 'Añadir a comanda';

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

            html += `<div class="config-section" data-grupo-id="${grupo.id}">
                <div class="config-section__title">${grupo.nombre}
                    ${grupo.obligatorio ? '<span class="config-required">*</span>' : ''}
                </div>
                <div class="config-chips" data-tipo="${grupo.tipo_seleccion}">`;

            (grupo.opciones || []).forEach(opcion => {
                // Buscar si ya estaba seleccionada para sacar la cantidad inicial
                let initialQty = 0;
                if (configExistente && configExistente.grupos) {
                    const gPrev = configExistente.grupos.find(gp => gp.grupo_id === grupo.id);
                    if (gPrev && gPrev.opciones) {
                        const oPrev = gPrev.opciones.find(op => op.opcion_id === opcion.id);
                        if (oPrev) {
                            initialQty = oPrev.cantidad || 1;
                        }
                    }
                } else {
                    // Si es un producto nuevo, aplicar la opción marcada por defecto
                    if (opcion.por_defecto) {
                        initialQty = 1;
                    }
                }

                const isSelected = initialQty > 0;
                const badgeHtml = `<span class="config-chip__badge" style="${isSelected && initialQty > 1 ? '' : 'display:none'}">x${initialQty}</span>`;
                
                // NO mostrar el botón de menos si la selección es ÚNICA y el grupo es OBLIGATORIO
                const tipoNorm = (grupo.tipo_seleccion || '').toString().trim().toLowerCase();
                const esUnica = (tipoNorm === 'unica' || tipoNorm === 'single' || tipoNorm === 'unico' || tipoNorm === 'u' || tipoNorm === 's' || tipoNorm === 'unicas');
                const esObligatorio = !!grupo.obligatorio;
                const showMinus = ! (esUnica && esObligatorio);
                
                const minusHtml = (isSelected && showMinus) 
                    ? `<span class="config-chip__minus">−</span>` 
                    : `<span class="config-chip__minus" style="display:none">−</span>`;

                html += `<button type="button" class="config-chip ${isSelected ? 'is-selected' : ''}" 
                            data-opcion-id="${opcion.id}" data-grupo-id="${grupo.id}"
                            data-precio-base="${opcion.precio_base}"
                            data-tipo="${tipoNorm}"
                            data-qty="${initialQty}"
                            data-obligatorio="${esObligatorio ? '1' : '0'}">
                            ${minusHtml}
                            <span class="config-chip__name">${getDisplayModifierName(opcion.nombre)}</span>
                            <span class="config-chip__price"></span>
                            ${badgeHtml}
                        </button>`;
            });

            html += `</div></div>`;
        });
    }

    body.innerHTML = html;

    // ── Bindings y Refresh inicial ──
    bindChipEvents(modal, prod, plantilla);
    recalcularPrecioConfigurable(modal, prod, plantilla);
    renderConfigSummary(modal, prod, plantilla);
}

/**
 * Enlaza eventos de click en los chips.
 */
function bindChipEvents(modal, prod, plantilla) {
    const body = modal.querySelector('#configModalBody');

    body.querySelectorAll('.config-chip:not(.config-chip--formato)').forEach(chip => {
        const minusBtn = chip.querySelector('.config-chip__minus');
        const badge = chip.querySelector('.config-chip__badge');

        const updateVisuals = () => {
            const qty = parseInt(chip.dataset.qty) || 0;
            const tipo = (chip.dataset.tipo || '').trim().toLowerCase();
            const esUnica = (tipo === 'unica' || tipo === 'single' || tipo === 'unico' || tipo === 'u' || tipo === 's' || tipo === 'unicas');
            const esObligatorio = chip.dataset.obligatorio === '1';
            const hideMinus = (esUnica && esObligatorio);

            if (qty > 0) {
                chip.classList.add('is-selected');
                if (minusBtn) minusBtn.style.display = hideMinus ? 'none' : '';
                if (badge) {
                    badge.style.display = qty > 1 ? '' : 'none';
                    badge.textContent = `x${qty}`;
                }
            } else {
                chip.classList.remove('is-selected');
                if (minusBtn) minusBtn.style.display = 'none';
                if (badge) badge.style.display = 'none';
            }
        };

        // Click en el chip (Incrementar)
        chip.addEventListener('click', (e) => {
            if (e.target.closest('.config-chip__minus')) return; // No procesar si pulsó el menos

            const container = chip.closest('.config-chips');
            const tipo = (chip.dataset.tipo || container?.dataset.tipo || '').trim().toLowerCase();
            const esUnica = (tipo === 'unica' || tipo === 'single' || tipo === 'unico' || tipo === 'u' || tipo === 's' || tipo === 'unicas');
            const isManualText = (chip.querySelector('.config-chip__name')?.textContent || '').includes('Comentario libre');
            const isManualPrice = (chip.querySelector('.config-chip__name')?.textContent || '').includes('Comodín');

            if (isManualText || isManualPrice) {
                handleManualChipClick(chip, isManualText ? 'text' : 'price', modal, prod, plantilla);
                return;
            }

            if (esUnica) {
                const grpId = chip.dataset.grupoId;
                body.querySelectorAll(`.config-chip[data-grupo-id="${grpId}"]`).forEach(c => {
                    if (c !== chip) {
                        c.dataset.qty = 0;
                        c.classList.remove('is-selected');
                        const mb = c.querySelector('.config-chip__minus');
                        const bb = c.querySelector('.config-chip__badge');
                        if (mb) mb.style.display = 'none';
                        if (bb) bb.style.display = 'none';
                    }
                });
                chip.dataset.qty = 1; // Solo se permite 1
            } else {
                let qty = parseInt(chip.dataset.qty) || 0;
                const acumulable = (typeof esModifAcumulable === 'function') ? esModifAcumulable() : true;
                if (acumulable) {
                    // Modo acumulable: cada click suma una unidad más (x2, x3...)
                    chip.dataset.qty = qty + 1;
                } else {
                    // Modo no acumulable: el click actúa como toggle on/off
                    chip.dataset.qty = qty > 0 ? 0 : 1;
                }
            }
            
            updateVisuals();
            recalcularPrecioConfigurable(modal, prod, plantilla);
            renderConfigSummary(modal, prod, plantilla);
        });

        // Click en el botón de menos (Decrementar)
        if (minusBtn) {
            minusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let qty = parseInt(chip.dataset.qty) || 0;

                const tipo = (chip.dataset.tipo || '').trim().toLowerCase();
                const esUnica = (tipo === 'unica' || tipo === 'single' || tipo === 'unico');
                const esObligatorio = chip.dataset.obligatorio === '1';

                // Si es única y obligatoria, no permitir bajar de 1
                if (qty <= 1 && esUnica && esObligatorio) return;

                if (qty > 0) {
                    chip.dataset.qty = qty - 1;
                    updateVisuals();
                    recalcularPrecioConfigurable(modal, prod, plantilla);
                    renderConfigSummary(modal, prod, plantilla);
                }
            });
        }
    });

    body.querySelectorAll('.config-chip--formato').forEach(chip => {
        chip.addEventListener('click', () => {
            body.querySelectorAll('.config-chip--formato').forEach(c => c.classList.remove('is-selected'));
            chip.classList.add('is-selected');
            
            recalcularPrecioConfigurable(modal, prod, plantilla);
            renderConfigSummary(modal, prod, plantilla);
        });
    });
}

/**
 * Maneja el clic en un chip de herramienta manual (Comodín o Comentario Libre).
 */
async function handleManualChipClick(chip, type, modal, prod, plantilla) {
    const title = type === 'text' ? 'Escribir observación' : 'Indicar suplemento';
    const result = await showManualInputModal(type, title);
    
    if (result !== null) {
        if (type === 'price') {
             // result es { precio, nombre }
             if (result.precio || result.nombre) {
                 modal._manualAdditions.push({ 
                     type: 'price', 
                     val: result.precio, 
                     nombre: result.nombre || 'Personalizado' 
                 });
             }
        } else {
             // result es solo texto
             if (result) {
                 modal._manualAdditions.push({ 
                     type: 'text', 
                     val: result 
                 });
             }
        }
        recalcularPrecioConfigurable(modal, prod, plantilla);
        renderConfigSummary(modal, prod, plantilla);
    }
}

/**
 * Calcula el precio total según formato + opciones seleccionadas.
 */
function recalcularPrecioConfigurable(modal, prod, plantilla) {
    const body = modal.querySelector('#configModalBody');
    let total = 0;

    // Precio del formato
    const formatoChip = body.querySelector('.config-chip--formato.is-selected');
    let fFactor = 1;
    if (formatoChip) {
        const pFijo = formatoChip.dataset.precioFijo;
        fFactor = parseFloat(formatoChip.dataset.factor) || 1;
        if (pFijo && pFijo !== 'null' && pFijo !== '') {
            total += parseFloat(pFijo);
        } else {
            total += parseFloat(prod.precio) * fFactor;
        }
    } else {
        total += parseFloat(prod.precio);
    }

    const formatoId = formatoChip ? parseInt(formatoChip.dataset.formatoId) : null;
    const allOptionChips = body.querySelectorAll('.config-chip:not(.config-chip--formato)');
    
    allOptionChips.forEach(chip => {
        const qty = parseInt(chip.dataset.qty) || 0;
        const opcionId = parseInt(chip.dataset.opcionId);
        let precioBase = parseFloat(chip.dataset.precioBase) || 0;

        // Buscar precio dinámico según formato
        let precioDinamic = precioBase;
        if (formatoId && plantilla.grupos) {
            for (const grupo of plantilla.grupos) {
                const opcion = (grupo.opciones || []).find(o => o.id === opcionId);
                if (opcion) {
                    const pf = (opcion.precios_formato || []).find(p => p.formato === formatoId);
                    if (pf) {
                        precioDinamic = parseFloat(pf.precio);
                    } else {
                        precioDinamic = precioBase * fFactor;
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

        // Si hay cantidad, sumar al total
        if (qty > 0) {
            total += precioDinamic * qty;
        }
    });

    // Sumar añadidos manuales múltiples
    if (modal._manualAdditions) {
        modal._manualAdditions.forEach(item => {
            if (item.type === 'price') {
                total += parseFloat(item.val) || 0;
            }
        });
    }

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

    // 1. Formato
    const formatoChip = body.querySelector('.config-chip--formato.is-selected');
    let factor = 1;
    let currentFormatoId = null;

    if (formatoChip) {
        currentFormatoId = parseInt(formatoChip.dataset.formatoId);
        const formato = plantilla.formatos.find(f => f.id === currentFormatoId);
        const precioFijo = formatoChip.dataset.precioFijo;
        let precioFormato;
        
        factor = parseFloat(formatoChip.dataset.factor) || 1;

        if (precioFijo && precioFijo !== 'null') {
            precioFormato = precioFijo;
        } else {
            precioFormato = (parseFloat(prod.precio) * factor).toFixed(2);
        }

        config.formato_id = currentFormatoId;
        config.formato_nombre = formato ? formato.nombre : '';
        config.precio_formato = precioFormato;
    }

    // 2. Grupos y Opciones estándar
    if (plantilla.grupos) {
        plantilla.grupos.forEach(grupo => {
            const grupoSection = body.querySelector(`.config-section[data-grupo-id="${grupo.id}"]`);
            if (!grupoSection) return;

            const opcionesSeleccionadas = [];
            grupoSection.querySelectorAll('.config-chip.is-selected:not(.config-chip--formato)').forEach(chip => {
                const name = chip.querySelector('.config-chip__name').textContent;
                const qty = parseInt(chip.dataset.qty) || 1;

                // Ignorar botones de factoría manual (Comodín/Comentario) ya que se gestionan aparte
                if (name.includes('Comentario libre') || name.includes('Comodín')) return;

                const opcionId = parseInt(chip.dataset.opcionId);
                const precioBase = parseFloat(chip.dataset.precioBase) || 0;
                const opcionData = grupo.opciones.find(o => o.id === opcionId);

                let precioFinal = precioBase;
                if (currentFormatoId && opcionData) {
                    const pf = (opcionData.precios_formato || []).find(p => p.formato === currentFormatoId);
                    if (pf) {
                        precioFinal = parseFloat(pf.precio);
                    } else {
                        const factorObj = (plantilla.formatos || []).find(f => f.id === currentFormatoId);
                        const factorValor = factorObj ? parseFloat(factorObj.factor) : 1;
                        precioFinal = precioBase * factorValor;
                    }
                }

                opcionesSeleccionadas.push({
                    opcion_id: opcionId,
                    nombre: opcionData ? opcionData.nombre : '',
                    precio: (precioFinal * qty).toFixed(2),
                    precio_unitario: precioFinal.toFixed(2),
                    cantidad: qty,
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

    // 3. Añadidos Manuales Múltiples
    config.manual_additions = [...(modal._manualAdditions || [])];

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

/**
 * Renderiza la lista de resumen en el sidebar izquierdo.
 */
function renderConfigSummary(modal, prod, plantilla) {
    const list = modal.querySelector('#configSummaryList');
    if (!list) return;

    let html = '';
    const body = modal.querySelector('#configModalBody');

    // 1. Formato
    const formatoChip = body.querySelector('.config-chip--formato.is-selected');
    if (formatoChip) {
        html += `<div class="config-summary-item">
            <div class="config-summary-item__text">Formato: <b>${formatoChip.querySelector('.config-chip__name').textContent}</b></div>
            <div class="config-summary-item__price"></div>
        </div>`;
    }

    // 2. Opciones estándar seleccionadas
    body.querySelectorAll('.config-chip.is-selected:not(.config-chip--formato)').forEach(chip => {
        const name = chip.querySelector('.config-chip__name').textContent;
        const qty = parseInt(chip.dataset.qty) || 1;
        
        // No mostramos los botones de factoría manual en el resumen
        if (name.includes('Comentario libre') || name.includes('Comodín')) return;

        // Calcular precio total para este item en el resumen
        const priceLabel = chip.querySelector('.config-chip__price').textContent;
        let linePriceHtml = '';
        if (priceLabel && priceLabel.includes('+')) {
            const unitPrice = parseFloat(priceLabel.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
            const totalLinePrice = unitPrice * qty;
            if (totalLinePrice > 0) {
                linePriceHtml = `+${formatPrecio(totalLinePrice)}`;
            }
        }

        html += `<div class="config-summary-item">
            <div class="config-summary-item__text">
                ${name} ${qty > 1 ? `<span class="badge-qty">x${qty}</span>` : ''}
            </div>
            <div class="config-summary-item__price">${linePriceHtml}</div>
        </div>`;
    });

    // 3. Añadidos Manuales (Múltiples)
    if (modal._manualAdditions) {
        modal._manualAdditions.forEach((item, index) => {
            const isPrice = item.type === 'price';
            const text = isPrice ? `${item.nombre}` : `📝 ${item.val}`;
            const priceHtml = isPrice ? `<span class="config-summary-item__price">+${formatPrecio(item.val)}</span>` : '';

            html += `<div class="config-summary-item">
                <div class="config-summary-item__text">${text}</div>
                ${priceHtml}
                <div class="config-summary-item__remove" onclick="removeManualAddition(${index})">&times;</div>
            </div>`;
        });
    }

    list.innerHTML = html || '<div style="color: var(--muted); font-size: 0.75rem; padding: 20px; text-align:center;">Sin selección</div>';
}

/**
 * Elimina un añadido manual de la lista.
 */
function removeManualAddition(index) {
    const modal = document.getElementById('modalConfigurable');
    if (modal && modal._manualAdditions) {
        modal._manualAdditions.splice(index, 1);
        recalcularPrecioConfigurable(modal, modal._prod, modal._plantilla);
        renderConfigSummary(modal, modal._prod, modal._plantilla);
    }
}
