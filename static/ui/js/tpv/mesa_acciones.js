// Punto de entrada: inicializa módulos y conecta los botones principales

document.addEventListener("DOMContentLoaded", () => {
    const Notify = window.Notify;
    initSidebarDesign();
    initAdaptiveActionLabels();
    // Arrancar módulos
    initCalculator();
    initModalCobro();
    initModalDividirCuenta();
    initModalClienteOpciones();
    cargarCatalogoTPV();

    // --- Botón Salir ---
    const btnSalirPrincipal = document.getElementById("btnSalir");
    const btnOpciones = document.getElementById("btnOpciones");
    const modalOpciones = document.getElementById("modalOpciones");
    const btnCerrarOpciones = document.getElementById("btnCerrarOpciones");

    if (btnSalirPrincipal) {
        btnSalirPrincipal.addEventListener("click", async () => {
            const confirmed = await Notify.confirm(
                gettext("Volverás al menú principal de la aplicación."),
                {
                    title: gettext("¿Quieres salir del TPV?"),
                    okText: gettext("Salir"),
                    cancelText: gettext("Cancelar"),
                }
            );
            if (!confirmed) return;
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

        // Modificadores acumulables
        const toggleAcum = document.getElementById('toggleModifAcumulable');
        if (toggleAcum) {
            toggleAcum.checked = (localStorage.getItem('tpv_modif_acumulable') === '1');
        }
    }

    function logUiEvent(evento, detalle, nivel = "INFO", origen = "ui.tpv") {
        if (window.TpvUtils && typeof window.TpvUtils.logUiEvent === "function") {
            window.TpvUtils.logUiEvent(evento, detalle, nivel, origen);
        }
    }

    function setTPVTheme(theme) {
        const previous = localStorage.getItem('tpv_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tpv_theme', theme);
        updateOptionsModalState();
        if (theme && theme !== previous) {
            logUiEvent("theme_change_tpv", `from=${previous} to=${theme}`);
        }
    }

    function setTPVLanguage(lang) {
        sessionStorage.setItem('open_options_modal', '1');
        const form = document.getElementById('langForm');
        const input = document.getElementById('langInput');
        const currentLang = (document.documentElement.lang || 'unknown').toLowerCase().split('-')[0];
        const targetLang = (lang || '').toLowerCase();
        if (targetLang && targetLang !== currentLang) {
            logUiEvent("language_change_tpv", `from=${currentLang} to=${targetLang}`, "INFO", "ui.tpv");
        }
        if (form && input) {
            input.value = lang;
            const nextInput = form.querySelector("input[name='next']");
            if (nextInput && targetLang) {
                nextInput.value = window.location.pathname.replace(/^\/(es|en)(?=\/|$)/i, `/${targetLang}`) + window.location.search;
            }
            form.submit();
        }
    }

    function setTPVModifAcumulable(checked) {
        localStorage.setItem('tpv_modif_acumulable', checked ? '1' : '0');
        logUiEvent(
            "modif_acumulable_change",
            `enabled=${checked ? "1" : "0"}`,
            "INFO",
            "ui.tpv.options"
        );
    }

    // Exponer al window para los onclick de HTML
    window.updateOptionsModalState = updateOptionsModalState;
    window.setTPVTheme = setTPVTheme;
    window.setTPVLanguage = setTPVLanguage;
    window.setTPVModifAcumulable = setTPVModifAcumulable;

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
                Notify.info(gettext("No hay comanda activa para esta mesa."));
                return;
            }
            window.open(getTpvUrl(`comprobante/${tpvState.comandaId}/`), "_blank");
        });
    }

    // --- Reimprimir ---
    const btnReimprimir = document.getElementById("btnReimprimir");
    if (btnReimprimir) {
        btnReimprimir.addEventListener("click", async () => {
            try {
                const response = await fetch("/api/facturas/ultima/");
                if (!response.ok) {
                    Notify.info(gettext("No se encontró ningún ticket anterior para reimprimir."));
                    return;
                }
                const data = await response.json();
                const parts = window.location.pathname.split('/');
                const tpvIndex = parts.indexOf('tpv');
                const ticketUrl = (tpvIndex !== -1)
                    ? `${window.location.origin}${parts.slice(0, tpvIndex + 1).join('/')}/ticket/${data.id}/`
                    : getTpvUrl(`ticket/${data.id}/`);
                window.open(ticketUrl, "_blank");
            } catch (err) {
                console.error("Error al reimprimir:", err);
                Notify.error(gettext("Error al intentar reimprimir el último ticket."));
            }
        });
    }

    // --- Borrar Comanda ---
    const btnBorrarComanda = document.getElementById("btnBorrarComanda");
    if (btnBorrarComanda) {
        btnBorrarComanda.addEventListener("click", async () => {
            const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
            if (lineasActivas.length === 0) return;

            if (await Notify.confirmDanger(gettext("¿Está seguro de que quiere borrar toda la comanda? Esta acción no se puede deshacer."), {
                title: "Confirmar",
            })) {
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
                if (!await Notify.confirm(gettext("¿Desea separar todos los productos de la mesa?"), { title: "Confirmar" })) return;
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
                if (!await Notify.confirm(gettext("¿Desea juntar todos los productos de la mesa?"), { title: "Confirmar" })) return;
                objetivo = lineasActivas;
            }

            let seHicieronCambios = false;
            const mapAgrupados = new Map();

            objetivo.forEach(linea => {
                // Generar una clave única basada en el producto + su configuración + su precio
                const configStr = JSON.stringify(linea.configuracion_json || {});
                const clave = `${linea.producto_id}_${configStr}_${linea.precio_unitario}`;

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
                if (await Notify.confirm("¿Desea aplicar el descuento a toda la mesa?", { title: "Confirmar" })) {
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

            if (await Notify.confirm(msg, { title: "Confirmar" })) {
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

    // --- Suplemento / Comentario Sidebar ---
    const btnSideComentario = document.getElementById("btnSideComentario");
    const btnSideSuplemento = document.getElementById("btnSideSuplemento");

    if (btnSideComentario) {
        btnSideComentario.addEventListener("click", async () => {
            const seleccionadas = getLineasSeleccionadasActivas();
            if (seleccionadas.length === 0) {
                if (typeof showAlerta === 'function') {
                    showAlerta(gettext("Atención"), gettext("Seleccione primero un producto del ticket."));
                } else {
            Notify.info(gettext("Seleccione primero un producto del ticket."));
                }
                return;
            }

            // Validar si están "acumulados" (mismo producto) si hay varios
            if (seleccionadas.length > 1) {
                const firstId = seleccionadas[0].producto_id;
                if (!seleccionadas.every(l => l.producto_id === firstId)) {
                    showAlerta(gettext("Atención"), gettext("Para añadir comentarios a varios artículos, estos deben ser del mismo tipo."));
                    return;
                }
            }

            // Ahora abrimos el modal de selección de perfiles rápidos
            abrirModificadoresRapido('comentario');
        });
    }

    if (btnSideSuplemento) {
        btnSideSuplemento.addEventListener("click", async () => {
            const seleccionadas = getLineasSeleccionadasActivas();
            if (seleccionadas.length === 0) {
                if (typeof showAlerta === 'function') {
                    showAlerta(gettext("Atención"), gettext("Seleccione primero un producto del ticket."));
                } else {
            Notify.info(gettext("Seleccione primero un producto del ticket."));
                }
                return;
            }

            // Validar si están "acumulados" (mismo producto) si hay varios
            if (seleccionadas.length > 1) {
                const firstId = seleccionadas[0].producto_id;
                if (!seleccionadas.every(l => l.producto_id === firstId)) {
                    showAlerta(gettext("Atención"), gettext("Para añadir suplementos a varios artículos, estos deben ser del mismo tipo."));
                    return;
                }
            }

            // Ahora abrimos el modal de selección de perfiles rápidos
            abrirModificadoresRapido('suplemento');
        });
    }
});

function initAdaptiveActionLabels() {
    const buttons = Array.from(document.querySelectorAll(".accion[data-label-full][data-label-short]"));
    if (buttons.length === 0) return;

    const updateButton = (button) => {
        const label = button.querySelector(".accion__label");
        if (!label) return;

        label.textContent = button.dataset.labelFull || label.textContent;
        if (label.scrollWidth > label.clientWidth) {
            label.textContent = button.dataset.labelShort || label.textContent;
        }
    };

    const updateAll = () => {
        buttons.forEach(updateButton);
    };

    requestAnimationFrame(updateAll);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(updateAll);
    }

    if (window.ResizeObserver) {
        const observer = new ResizeObserver(updateAll);
        buttons.forEach(button => observer.observe(button));
    } else {
        window.addEventListener("resize", updateAll);
    }

    window.adaptActionLabels = updateAll;
}

function initSidebarDesign() {
    const config = window.TPV_SIDEBAR_LAYOUT || {};
    const buttonsConfig = config.buttons || {};
    const localizedLabels = {
        btnCobrar: { label: gettext("Total"), short: gettext("Total"), known: ["Total"] },
        btnComprobante: { label: gettext("Comprobante"), short: gettext("Comp."), known: ["Comprobante", "Comp."] },
        btnReimprimir: { label: gettext("Reimprimir"), short: gettext("Reimp."), known: ["Reimpr.", "Reimprimir", "Reimp."] },
        btnFactura: { label: gettext("Factura"), short: gettext("Fact."), known: ["Factura", "Fact."] },
        btnDescuento: { label: gettext("Descuento"), short: gettext("Dto."), known: ["Dto.", "Descuento"] },
        btnInvita: { label: gettext("Invitar"), short: gettext("Inv."), known: ["Invitar", "Inv."] },
        btnAnularLinea: { label: gettext("Anular"), short: gettext("Anul."), known: ["Anular", "Anul."] },
        btnBorrarComanda: { label: gettext("Borrar comanda"), short: gettext("Borrar"), known: ["Borrar comanda", "Borrar"] },
        btnSepararProductos: { label: gettext("Separar"), short: gettext("Sep."), known: ["Separar", "Sep."] },
        btnJuntarProductos: { label: gettext("Juntar"), short: gettext("Junt."), known: ["Juntar", "Junt."] },
        btnSideComentario: { label: gettext("Comentario"), short: gettext("Coment."), known: ["Comentario", "Coment."] },
        btnSideSuplemento: { label: gettext("Suplemento"), short: gettext("Supl."), known: ["Suplemento", "Supl."] },
        btnCliente: { label: gettext("Cliente"), short: gettext("Cliente"), known: ["Cliente"] },
        btnDividirCuenta: { label: gettext("Dividir cuenta"), short: gettext("Dividir"), known: ["Dividir cuenta", "Dividir"] },
        btnCajon: { label: gettext("Cajón"), short: gettext("Cajón"), known: ["Cajón", "Caj\u00f3n"] },
        btnOpciones: { label: gettext("Opciones"), short: gettext("Opc."), known: ["Opciones", "Opc."] },
        btnSalir: { label: gettext("Salir"), short: gettext("Salir"), known: ["Salir"] },
    };
    const defaultItems = [
        { type: "button", id: "btnCobrar" },
        { type: "button", id: "btnComprobante" },
        { type: "button", id: "btnReimprimir" },
        { type: "button", id: "btnFactura" },
        { type: "button", id: "btnDescuento" },
        { type: "button", id: "btnInvita" },
        { type: "button", id: "btnAnularLinea" },
        { type: "sep", id: "sepLinea" },
        { type: "button", id: "btnBorrarComanda" },
        { type: "button", id: "btnSepararProductos" },
        { type: "button", id: "btnJuntarProductos" },
        { type: "button", id: "btnSideComentario" },
        { type: "button", id: "btnSideSuplemento" },
        { type: "button", id: "btnCliente" },
        { type: "sep", id: "sepCliente" },
        { type: "button", id: "btnDividirCuenta" },
        { type: "button", id: "btnCajon" },
        { type: "button", id: "btnOpciones" },
        { type: "sep", id: "sepOpciones" },
        { type: "button", id: "btnSalir" },
    ];

    const localizeConfiguredLabel = (buttonId, value, field) => {
        const text = typeof value === "string" ? value.trim() : "";
        const labels = localizedLabels[buttonId];
        if (!labels) return text;
        return labels.known.includes(text) ? labels[field] : text;
    };

    normalizeSidebarItems(config.items, defaultItems).forEach((item, index) => {
        const element = item.type === "sep"
            ? document.querySelector(`[data-sidebar-item="${item.id}"]`)
            : document.getElementById(item.id);
        if (element) element.style.order = String((index + 1) * 10);
    });

    Object.entries(buttonsConfig).forEach(([buttonId, settings]) => {
        const button = document.getElementById(buttonId);
        if (!button || !settings) return;

        const span = Number(settings.span) === 1 ? 1 : 2;
        button.style.gridColumn = `span ${span}`;

        if (settings.bg) {
            button.style.setProperty("background", settings.bg, "important");
        }
        if (settings.color) {
            button.style.setProperty("color", settings.color, "important");
        }
        if (settings.border) {
            button.style.setProperty("border-color", settings.border, "important");
        }

        if (typeof settings.label === "string" && settings.label.trim()) {
            const label = localizeConfiguredLabel(buttonId, settings.label, "label");
            const shortSource = typeof settings.short === "string" && settings.short.trim() ? settings.short.trim() : settings.label;
            const short = localizeConfiguredLabel(buttonId, shortSource, "short") || label;
            const labelElement = button.querySelector(".accion__label");
            button.dataset.labelFull = label;
            button.dataset.labelShort = short;
            if (labelElement) labelElement.textContent = label;
            if (button.hasAttribute("title")) button.setAttribute("title", label);
        }

        if (typeof settings.icon === "string" && settings.icon.trim()) {
            applySidebarButtonIcon(button, settings.icon.trim());
        }
    });
}

function normalizeSidebarItems(rawItems, defaultItems) {
    const valid = new Map(defaultItems.map(item => [item.id, item]));
    const source = Array.isArray(rawItems) ? rawItems : defaultItems;
    const seen = new Set();
    const items = [];

    source.forEach(rawItem => {
        const id = typeof rawItem === "string" ? rawItem : rawItem?.id;
        const item = valid.get(id);
        if (!item || seen.has(id)) return;
        seen.add(id);
        items.push({ ...item });
    });

    defaultItems.forEach(item => {
        if (!seen.has(item.id)) items.push({ ...item });
    });

    return items;
}

function applySidebarButtonIcon(button, iconName) {
    if (!/^[a-z0-9-]+$/i.test(iconName)) return;
    let icon = button.querySelector(".accion__icon-mask");
    const currentIcon = button.querySelector(".icono--btn");

    if (!icon) {
        icon = document.createElement("span");
        icon.className = "icono icono--btn accion__icon-mask";
        if (currentIcon) {
            currentIcon.replaceWith(icon);
        } else {
            button.prepend(icon);
        }
    }

    icon.style.setProperty("--icon-url", `url("/static/ui/img/iconos/${iconName}.svg")`);
}
