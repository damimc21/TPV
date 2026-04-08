// Renderizado del ticket (líneas de comanda) e historial undo/redo

// Guarda una instantánea del ticket para deshacer/rehacer
function saveHistoryState(isInitial = false) {
    const stateParaGuardar = tpvState.lineas.map(l => {
        const { id, ...resto } = l;
        return resto;
    });

    const newStateStr = JSON.stringify(stateParaGuardar);

    if (isInitial) {
        tpvState.historyStack = [newStateStr];
        tpvState.historyIndex = 0;
    } else {
        if (
            tpvState.historyStack.length > 0 &&
            tpvState.historyStack[tpvState.historyIndex] === newStateStr
        ) {
            return;
        }

        if (tpvState.historyIndex < tpvState.historyStack.length - 1) {
            tpvState.historyStack = tpvState.historyStack.slice(0, tpvState.historyIndex + 1);
        }

        tpvState.historyStack.push(newStateStr);
        tpvState.historyIndex++;
    }
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById("btnUndoComanda");
    const btnRedo = document.getElementById("btnRedoComanda");
    if (btnUndo) btnUndo.disabled = tpvState.historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = tpvState.historyIndex >= tpvState.historyStack.length - 1;
}

// Dibuja todas las líneas activas en el panel de ticket
function renderTicket() {
    const contenedor = document.getElementById("listaComandas");
    if (!contenedor) return;

    contenedor.innerHTML = "";
    const lineasActivas = tpvState.lineas.filter(l => !l.anulado);

    if (tpvState.isInitialLoading) {
        contenedor.innerHTML = "";
        return;
    }

    if (lineasActivas.length === 0) {
        contenedor.innerHTML = '<div class="ticket__vacia">Sin líneas</div>';
        actualizarTotalesTicket(0, 0);
        return;
    }

    let subtotalTotal = 0;
    let numArticulos = 0;

    lineasActivas.forEach((linea) => {
        asegurarLineaUid(linea);
        subtotalTotal += linea.total;
        numArticulos += linea.cantidad;

        const div = document.createElement("div");
        div.className = "ticket__linea";
        if (estaLineaSeleccionada(linea)) div.classList.add("is-selected");
        div.dataset.uid = linea._uid;

        // Botón dividir o juntar según contexto
        let splitJoinIcon = '';
        if (linea.cantidad > 1) {
            splitJoinIcon = '<span class="qty-splitjoin" title="Separar una unidad" data-action="split">🔀</span>';
        } else if (linea.cantidad === 1) {
            const tieneDuplicado = lineasActivas.some(l => l._uid !== linea._uid && l.producto_id === linea.producto_id);
            if (tieneDuplicado) {
                splitJoinIcon = '<span class="qty-splitjoin" title="Juntar con otra línea" data-action="join">🔗</span>';
            }
        }

        const splitJoinBtnHtml = splitJoinIcon || '<span class="qty-splitjoin"></span>';
        const discountBadge = linea.descuento > 0 ? ` <span class="badge-dto">-${linea.descuento}%</span>` : '';
        const editBadge = linea.configuracion_json ? ` <span class="ticket__config-badge" title="Editar configuración">⚙️ Editar</span>` : '';

        let configDetailsHtml = '';
        if (linea.configuracion_json && linea.configuracion_json.grupos) {
            const detalles = [];
            linea.configuracion_json.grupos.forEach(g => {
                if (g.opciones && g.opciones.length > 0) {
                    // Mostramos solo lo que sea visible en factura para el cliente (vista TPV)
                    const visibles = g.opciones.filter(o => o.visible_factura !== false);
                    if (visibles.length > 0) {
                        detalles.push(visibles.map(o => o.nombre).join(', '));
                    }
                }
                if (g.texto_libre) {
                    detalles.push(`"${g.texto_libre}"`);
                }
            });
            if (detalles.length > 0) {
                configDetailsHtml = `<div class="ticket__config-detail">${detalles.join(' · ')}</div>`;
            }
        }

        div.innerHTML = `
            <span class="ticket__qty-controls">
                <span class="qty-btn qty-minus">−</span>
                <span class="qty-val">${linea.cantidad}</span>
                <span class="qty-btn qty-plus">+</span>
            </span>
            <div class="ticket__col--name">
                <div>${linea.producto_nombre}${discountBadge}${editBadge}</div>
                ${configDetailsHtml}
            </div>
            <span class="ticket__col--precio">${formatPrecio(linea.precio_unitario)}</span>
            <span class="ticket__col--total">${formatPrecio(linea.total)}</span>
            ${splitJoinBtnHtml}
            <span class="qty-delete" title="Eliminar línea">✕</span>
        `;

        div.addEventListener("click", () => {
            toggleLineaSeleccion(linea);
            renderTicket();
        });

        // Controles de cantidad y acciones rápidas
        const btnMinus = div.querySelector(".qty-minus");
        const btnPlus = div.querySelector(".qty-plus");
        const valSpan = div.querySelector(".qty-val");
        const btnDelete = div.querySelector(".qty-delete");
        const btnSplitJoin = div.querySelector(".qty-splitjoin");
        const btnEditBadge = div.querySelector(".ticket__config-badge");

        if (btnEditBadge) {
            btnEditBadge.addEventListener("click", async (e) => {
                e.stopPropagation(); // Evitar seleccionar la línea
                if (typeof abrirModalConfigurable === 'function') {
                    // Fetch full product object to open modal correctly
                    try {
                        const res = await fetch(`/api/productos/${linea.producto_id}/`, {
                            headers: { 'X-CSRFToken': getCSRFToken() }
                        });
                        const prod = await res.json();
                        abrirModalConfigurable(prod, linea);
                    } catch (err) {
                        console.error('Error fetching product for edit', err);
                    }
                }
            });
        }

        if (btnSplitJoin) {
            btnSplitJoin.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = btnSplitJoin.dataset.action;
                const targetIndex = tpvState.lineas.findIndex(l => l._uid === linea._uid);
                if (targetIndex === -1) return;

                if (action === "split") {
                    linea.cantidad -= 1;
                    recalcularLinea(linea);
                    const nuevaLinea = {
                        ...linea,
                        _uid: `l_${tpvState.nextLineaUid++}`,
                        id: null,
                        cantidad: 1
                    };
                    recalcularLinea(nuevaLinea);
                    tpvState.lineas.splice(targetIndex + 1, 0, nuevaLinea);
                } else if (action === "join") {
                    const indexMadre = tpvState.lineas.findIndex(l => l._uid !== linea._uid && l.producto_id === linea.producto_id && !l.anulado);
                    if (indexMadre !== -1) {
                        const lineaMadre = tpvState.lineas[indexMadre];
                        lineaMadre.cantidad += 1;
                        recalcularLinea(lineaMadre);
                        eliminarLineaPorIndice(targetIndex);
                    }
                }
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            });
        }

        btnMinus.addEventListener("click", async (e) => {
            e.stopPropagation();
            const targetIndex = tpvState.lineas.findIndex(l => l._uid === linea._uid);
            if (targetIndex === -1) return;
            if (linea.cantidad > 1) {
                linea.cantidad -= 1;
                recalcularLinea(linea);
            } else {
                eliminarLineaPorIndice(targetIndex);
            }
            renderTicket();
            saveHistoryState();
            await sincronizarComanda();
        });

        btnPlus.addEventListener("click", async (e) => {
            e.stopPropagation();
            linea.cantidad += 1;
            recalcularLinea(linea);
            renderTicket();
            saveHistoryState();
            await sincronizarComanda();
        });

        valSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            window.lineaEditandoCantidadUid = linea._uid;
            const modal = document.getElementById("modalCantidadCustom");
            const display = document.getElementById("modalCantidadCustomDisplay");
            if (modal && display) {
                display.value = "";
                modal.classList.remove("hidden");
            }
        });

        if (btnDelete) {
            btnDelete.addEventListener("click", async (e) => {
                e.stopPropagation();
                const targetIndex = tpvState.lineas.findIndex(l => l._uid === linea._uid);
                if (targetIndex !== -1) {
                    eliminarLineaPorIndice(targetIndex);
                }
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            });
        }

        contenedor.appendChild(div);
    });

    actualizarTotalesTicket(subtotalTotal, numArticulos);
    actualizarUIBotonInvita();
    contenedor.scrollTop = contenedor.scrollHeight;
}

// Actualiza el texto del botón invitar según la selección
function actualizarUIBotonInvita() {
    const btnInvita = document.getElementById("btnInvita");
    if (!btnInvita) return;

    const seleccionadas = getLineasSeleccionadasActivas();
    let objetivo = (seleccionadas.length === 0) ? tpvState.lineas.filter(l => !l.anulado) : seleccionadas;

    if (objetivo.length === 0) {
        btnInvita.textContent = "🎁 Invitar";
        return;
    }

    const todosInvitados = objetivo.every(l => l.descuento === 100);
    btnInvita.textContent = todosInvitados ? "❌ Invitar" : "🎁 Invitar";
}

// Muestra los totales en la parte inferior del ticket
function actualizarTotalesTicket(subtotal, numArticulos) {
    const elSubtotal = document.getElementById("totalComanda");
    if (elSubtotal) elSubtotal.textContent = formatPrecio(subtotal);

    const infoElems = document.querySelectorAll(".ticket__infoLeft span");
    if (infoElems.length >= 2) {
        infoElems[1].textContent = `Artículos: ${numArticulos}`;
    }
}
