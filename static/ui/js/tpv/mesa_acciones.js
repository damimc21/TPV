// Punto de entrada: inicializa módulos y conecta los botones principales

document.addEventListener("DOMContentLoaded", () => {
    // Arrancar módulos
    initCalculator();
    initModalCobro();
    initModalDividirCuenta();
    initModalClienteOpciones();
    cargarCatalogoTPV();

    // --- Botón Salir ---
    const btnSalirPrincipal = document.getElementById("btnSalir");
    const modalSalir = document.getElementById("modalSalir");
    const btnSalirCancelar = document.getElementById("btnSalirCancelar");
    const btnSalirConfirmar = document.getElementById("btnSalirConfirmar");

    if (btnSalirPrincipal && modalSalir) {
        btnSalirPrincipal.addEventListener("click", () => {
            modalSalir.classList.remove("hidden");
        });
    }
    if (btnSalirCancelar && modalSalir) {
        btnSalirCancelar.addEventListener("click", () => {
            modalSalir.classList.add("hidden");
        });
    }
    if (btnSalirConfirmar) {
        btnSalirConfirmar.addEventListener("click", () => {
            window.location.href = window.TPV_INDEX_URL || "/";
        });
    }

    if (btnOpciones && modalOpciones) {
        btnOpciones.addEventListener("click", () => {
            updateOptionsModalState();
            modalOpciones.classList.remove("hidden");
        });
        
        btnCerrarOpciones.addEventListener("click", () => {
            modalOpciones.classList.add("hidden");
        });

        // Reabrir si venimos de cambiar idioma (SessionStorage)
        if (sessionStorage.getItem('open_options_modal') === '1') {
            updateOptionsModalState();
            modalOpciones.classList.remove("hidden");
            sessionStorage.removeItem('open_options_modal');
        }
    }

    // Funciones globales para el modal de opciones (aisladas y elevadas)
    function updateOptionsModalState() {
        const theme = localStorage.getItem('tpv_theme') || 'dark';
        const lang = document.documentElement.lang || 'es';

        // Tema
        const btnDark = document.getElementById('btnThemeDark');
        const btnLight = document.getElementById('btnThemeLight');
        if (btnDark) btnDark.classList.toggle('is-active', theme === 'dark');
        if (btnLight) btnLight.classList.toggle('is-active', theme === 'light');

        // Idioma
        const btnES = document.getElementById('btnLangES');
        const btnEN = document.getElementById('btnLangEN');
        if (btnES) btnES.classList.toggle('is-active', lang.startsWith('es'));
        if (btnEN) btnEN.classList.toggle('is-active', lang.startsWith('en'));
    }

    function setTPVTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tpv_theme', theme);
        updateOptionsModalState();
    }

    function setTPVLanguage(lang) {
        sessionStorage.setItem('open_options_modal', '1');
        const form = document.getElementById('langForm');
        const input = document.getElementById('langInput');
        if (form && input) {
            input.value = lang;
            form.submit();
        }
    }

    // Exponer al window para los onclick de HTML
    window.updateOptionsModalState = updateOptionsModalState;
    window.setTPVTheme = setTPVTheme;
    window.setTPVLanguage = setTPVLanguage;

    // --- Footer dinámico ---
    const elTerminal = document.getElementById("terminal");
    const elConexion = document.getElementById("conexion");
    const elCajaEstado = document.getElementById("cajaEstado");
    const elJornadaEstado = document.getElementById("jornadaEstado");

    if (elTerminal && window.TPV_TERMINAL_ID) elTerminal.textContent = window.TPV_TERMINAL_ID;
    if (elConexion && window.TPV_CONEXION) elConexion.textContent = window.TPV_CONEXION;
    if (elCajaEstado && window.TPV_CAJA_ESTADO) elCajaEstado.textContent = window.TPV_CAJA_ESTADO;
    if (elJornadaEstado && window.TPV_JORNADA_ESTADO) elJornadaEstado.textContent = window.TPV_JORNADA_ESTADO;

    // --- Botón Anular Línea ---
    const btnAnularLinea = document.getElementById("btnAnularLinea");
    if (btnAnularLinea) {
        btnAnularLinea.addEventListener("click", async () => {
            const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
            if (lineasActivas.length === 0) return;

            const seleccionadas = getLineasSeleccionadasActivas();
            if (seleccionadas.length > 0) {
                seleccionadas.forEach((linea) => {
                    const targetIndex = tpvState.lineas.findIndex(l => l._uid === linea._uid);
                    if (targetIndex === -1) return;
                    if (linea.cantidad > 1) {
                        linea.cantidad -= 1;
                        recalcularLinea(linea);
                    } else {
                        eliminarLineaPorIndice(targetIndex);
                    }
                });
                limpiarSeleccionLineas();
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
                return;
            }

            let targetIndex = tpvState.lineaSeleccionadaIndex;
            if (targetIndex === null || targetIndex >= tpvState.lineas.length || tpvState.lineas[targetIndex].anulado) {
                if (tpvState.historialInserciones.length > 0) {
                    const ultimoProdId = tpvState.historialInserciones.pop();
                    targetIndex = tpvState.lineas.findIndex(l => l.producto_id === ultimoProdId && !l.anulado);
                }
            } else {
                const lineaVisual = tpvState.lineas[targetIndex];
                const hIndex = tpvState.historialInserciones.lastIndexOf(lineaVisual.producto_id);
                if (hIndex !== -1) tpvState.historialInserciones.splice(hIndex, 1);
            }

            if (targetIndex !== null && targetIndex >= 0) {
                const linea = tpvState.lineas[targetIndex];
                if (linea.cantidad > 1) {
                    linea.cantidad -= 1;
                    recalcularLinea(linea);
                } else {
                    eliminarLineaPorIndice(targetIndex);
                }
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            }
        });
    }

    // --- Deshacer / Rehacer ---
    const btnUndo = document.getElementById("btnUndoComanda");
    const btnRedo = document.getElementById("btnRedoComanda");

    if (btnUndo) {
        btnUndo.addEventListener("click", async () => {
            if (tpvState.historyIndex <= 0) return;
            tpvState.historyIndex--;
            tpvState.lineas = JSON.parse(tpvState.historyStack[tpvState.historyIndex]);
            rehidratarLineas(tpvState.lineas);
            limpiarSeleccionLineas();
            tpvState.historialInserciones = [];
            tpvState.lineas.forEach(l => {
                for (let i = 0; i < l.cantidad; i++) {
                    tpvState.historialInserciones.push(l.producto_id);
                }
            });
            renderTicket();
            updateUndoRedoButtons();
            await sincronizarComanda();
        });
    }

    if (btnRedo) {
        btnRedo.addEventListener("click", async () => {
            if (tpvState.historyIndex >= tpvState.historyStack.length - 1) return;
            tpvState.historyIndex++;
            tpvState.lineas = JSON.parse(tpvState.historyStack[tpvState.historyIndex]);
            rehidratarLineas(tpvState.lineas);
            limpiarSeleccionLineas();
            tpvState.historialInserciones = [];
            tpvState.lineas.forEach(l => {
                for (let i = 0; i < l.cantidad; i++) {
                    tpvState.historialInserciones.push(l.producto_id);
                }
            });
            renderTicket();
            updateUndoRedoButtons();
            await sincronizarComanda();
        });
    }

    // --- Comprobante ---
    const btnComprobante = document.getElementById("btnComprobante");
    if (btnComprobante) {
        btnComprobante.addEventListener("click", async () => {
            if (tpvState.lineas.filter(l => !l.anulado).length === 0) return;
            await sincronizarComanda();
            if (!tpvState.comandaId) {
                showAlert(gettext("No hay comanda activa para esta mesa."));
                return;
            }
            window.open(`/es/tpv/comprobante/${tpvState.comandaId}/`, "_blank");
        });
    }

    // --- Reimprimir ---
    const btnReimprimir = document.getElementById("btnReimprimir");
    if (btnReimprimir) {
        btnReimprimir.addEventListener("click", async () => {
            try {
                const response = await fetch("/api/facturas/ultima/");
                if (!response.ok) {
                    showAlert(gettext("No se encontró ningún ticket anterior para reimprimir."));
                    return;
                }
                const data = await response.json();
                const parts = window.location.pathname.split('/');
                const tpvIndex = parts.indexOf('tpv');
                const ticketUrl = (tpvIndex !== -1)
                    ? `${window.location.origin}${parts.slice(0, tpvIndex + 1).join('/')}/ticket/${data.id}/`
                    : `/es/tpv/ticket/${data.id}/`;
                window.open(ticketUrl, "_blank");
            } catch (err) {
                console.error("Error al reimprimir:", err);
                showAlert(gettext("Error al intentar reimprimir el último ticket."));
            }
        });
    }

    // --- Borrar Comanda ---
    const btnBorrarComanda = document.getElementById("btnBorrarComanda");
    if (btnBorrarComanda) {
        btnBorrarComanda.addEventListener("click", async () => {
            const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
            if (lineasActivas.length === 0) return;

            if (await showConfirm(gettext("¿Está seguro de que quiere borrar toda la comanda? Esta acción no se puede deshacer."))) {
                tpvState.lineas = [];
                tpvState.historialInserciones = [];
                limpiarSeleccionLineas();
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            }
        });
    }

    // --- Separar Productos ---
    const btnSepararProductos = document.getElementById("btnSepararProductos");
    if (btnSepararProductos) {
        btnSepararProductos.addEventListener("click", async () => {
            let objetivo = getLineasSeleccionadasActivas();
            if (objetivo.length === 0) {
                const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
                if (lineasActivas.length === 0) return;
                if (!await showConfirm(gettext("¿Desea separar todos los productos de la mesa?"))) return;
                objetivo = lineasActivas;
            }

            let seHicieronCambios = false;
            objetivo.forEach(lineaOrig => {
                if (lineaOrig.cantidad > 1) {
                    const cantExtra = lineaOrig.cantidad - 1;
                    lineaOrig.cantidad = 1;
                    recalcularLinea(lineaOrig);

                    const origIndex = tpvState.lineas.findIndex(l => l._uid === lineaOrig._uid);
                    if (origIndex !== -1) {
                        const nuevasLineas = [];
                        for (let i = 0; i < cantExtra; i++) {
                            const nl = {
                                ...lineaOrig,
                                _uid: `l_${tpvState.nextLineaUid++}`,
                                id: null,
                                cantidad: 1
                            };
                            recalcularLinea(nl);
                            nuevasLineas.push(nl);
                        }
                        tpvState.lineas.splice(origIndex + 1, 0, ...nuevasLineas);
                    }
                    seHicieronCambios = true;
                }
            });

            if (seHicieronCambios) {
                limpiarSeleccionLineas();
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            }
        });
    }

    // --- Juntar Productos ---
    const btnJuntarProductos = document.getElementById("btnJuntarProductos");
    if (btnJuntarProductos) {
        btnJuntarProductos.addEventListener("click", async () => {
            let objetivo = getLineasSeleccionadasActivas();
            if (objetivo.length === 0) {
                const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
                if (lineasActivas.length === 0) return;
                if (!await showConfirm(gettext("¿Desea juntar todos los productos de la mesa?"))) return;
                objetivo = lineasActivas;
            }

            let seHicieronCambios = false;
            const mapAgrupados = new Map();

            objetivo.forEach(linea => {
                const clave = `${linea.producto_id}`;
                if (mapAgrupados.has(clave)) {
                    const lineaMadre = mapAgrupados.get(clave);
                    lineaMadre.cantidad += linea.cantidad;
                    recalcularLinea(lineaMadre);

                    const targetIndex = tpvState.lineas.findIndex(l => l._uid === linea._uid);
                    if (targetIndex !== -1) {
                        eliminarLineaPorIndice(targetIndex);
                    }
                    seHicieronCambios = true;
                } else {
                    mapAgrupados.set(clave, linea);
                }
            });

            if (seHicieronCambios) {
                limpiarSeleccionLineas();
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            }
        });
    }

    // --- Descuento ---
    const btnDescuento = document.getElementById("btnDescuento");
    if (btnDescuento) {
        btnDescuento.addEventListener("click", async () => {
            const seleccionadas = getLineasSeleccionadasActivas();
            if (seleccionadas.length === 0) {
                const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
                if (lineasActivas.length === 0) return;
                if (await showConfirm("¿Desea aplicar el descuento a toda la mesa?")) {
                    window.descuentoObjetivo = "toda-la-mesa";
                    abrirModalDescuento();
                }
            } else {
                window.descuentoObjetivo = "seleccionadas";
                abrirModalDescuento();
            }
        });
    }

    // --- Invitar ---
    const btnInvita = document.getElementById("btnInvita");
    if (btnInvita) {
        btnInvita.addEventListener("click", async () => {
            const seleccionadas = getLineasSeleccionadasActivas();
            let objetivo = [];
            const esSeleccion = seleccionadas.length > 0;

            if (!esSeleccion) {
                objetivo = tpvState.lineas.filter(l => !l.anulado);
            } else {
                objetivo = seleccionadas;
            }

            if (objetivo.length === 0) return;

            const todosInvitados = objetivo.every(l => l.descuento === 100);
            let msg = "";
            let nuevoDescuento = 0;

            if (todosInvitados) {
                msg = esSeleccion
                    ? "¿Desea quitar la invitación a las líneas seleccionadas?"
                    : "¿Desea quitar la invitación a toda la mesa?";
                nuevoDescuento = 0;
            } else {
                msg = esSeleccion
                    ? "¿Desea invitar a las líneas seleccionadas?"
                    : "¿Desea invitar a toda la mesa?";
                nuevoDescuento = 100;
            }

            if (await showConfirm(msg)) {
                objetivo.forEach(linea => {
                    linea.descuento = nuevoDescuento;
                    recalcularLinea(linea);
                });
                limpiarSeleccionLineas();
                renderTicket();
                saveHistoryState();
                await sincronizarComanda();
            }
        });
    }
});
