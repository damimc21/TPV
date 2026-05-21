// Modal de cobro y procesamiento de pago

function initModalCobro(forcedTotal = null, forcedLineas = null) {
    const Notify = window.Notify;
    const modal = document.getElementById("modalCobro");
    const totalValorEl = document.getElementById("cobroTotal");
    const inputEntregado = document.getElementById("cobroEntregadoInput");
    const cambioValorEl = document.getElementById("cobroCambioValor");
    const zonaCambio = document.getElementById("contenedorEfectivo");
    const keypad = document.getElementById("cobroKeypad");
    const metodos = document.querySelectorAll(".cobro-metodo");

    const btnConTicket = document.getElementById("btnCobrarConTicket");
    const btnSinTicket = document.getElementById("btnCobrarSinTicket");
    const btnCancelar = document.getElementById("btnCobrarCancelar");
    const btnExacto = document.getElementById("btnCobroExacto");
    const btnBack = document.getElementById("btnBackCobroPay");

    const btnAbrirTotal = document.getElementById("btnCobrar");
    const btnCerrarX = document.getElementById("btnCobrarCerrarX");
    const btnClienteCobro = document.getElementById("btnCobroCliente");
    const labelClienteCobro = document.getElementById("cobroClienteNombre");

    if (!modal) return;

    let clienteLocal = null;
    let entregadoStr = "";
    let metodoActual = "efectivo";
    let totalMesa = 0;
    let isProcessing = false;
    let splittingLineas = forcedLineas;

    const fmtPrecio = (val) => val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

    const calcularTotalMesa = () => {
        let sum = 0;
        tpvState.lineas.forEach(l => {
            if (l.anulado) return;
            recalcularLinea(l);
            sum += l.total;
        });
        return Math.round(sum * 100) / 100;
    };

    const actualizarCambio = () => {
        if (!cambioValorEl) return;
        const entregadoNum = parseFloat(entregadoStr) || 0;
        const cambio = entregadoNum - totalMesa;

        const labelEl = cambioValorEl.previousElementSibling;

        if (entregadoNum > 0 && cambio < -0.001) {
            if (labelEl) labelEl.textContent = "FALTAN";
            cambioValorEl.textContent = fmtPrecio(Math.abs(cambio));
            zonaCambio.style.borderColor = "rgba(239, 68, 68, 0.2)";
            zonaCambio.style.background = "rgba(239, 68, 68, 0.05)";
            if (labelEl) labelEl.style.color = "#ef4444";
            cambioValorEl.style.color = "#ef4444";
        } else {
            if (labelEl) labelEl.textContent = "CAMBIO";
            cambioValorEl.textContent = fmtPrecio(Math.max(cambio, 0));
            zonaCambio.style.borderColor = "rgba(74, 222, 128, 0.2)";
            zonaCambio.style.background = "rgba(74, 222, 128, 0.05)";
            if (labelEl) labelEl.style.color = "#4ade80";
            cambioValorEl.style.color = "#4ade80";
        }
    };

    const setMetodo = (metodo) => {
        metodoActual = metodo;
        metodos.forEach(m => {
            if (m.dataset.metodo === metodo) {
                m.classList.add("cobro-metodo--activo");
            } else {
                m.classList.remove("cobro-metodo--activo");
            }
        });

        if (metodo === "efectivo") {
            zonaCambio.style.visibility = "visible";
            zonaCambio.style.opacity = "1";
        } else {
            zonaCambio.style.visibility = "hidden";
            zonaCambio.style.opacity = "0.2";
            entregadoStr = "";
            if (inputEntregado) inputEntregado.value = "0";
            actualizarCambio();
        }
    };

    const resetModal = () => {
        totalMesa = forcedTotal !== null ? forcedTotal : calcularTotalMesa();
        entregadoStr = "";
        isProcessing = false;

        clienteLocal = tpvState.clienteId ? { id: tpvState.clienteId, nombre: tpvState.clienteNombre, email: tpvState.clienteEmail || null } : null;
        if (labelClienteCobro) {
            labelClienteCobro.textContent = clienteLocal ? clienteLocal.nombre : gettext("Ningún cliente seleccionado");
        }

        if (btnConTicket) btnConTicket.disabled = false;
        if (btnSinTicket) btnSinTicket.disabled = false;
        if (inputEntregado) inputEntregado.value = "0";
        if (totalValorEl) totalValorEl.textContent = fmtPrecio(totalMesa);
        setMetodo("efectivo");
        actualizarCambio();
    };

    if (btnClienteCobro) {
        btnClienteCobro.onclick = () => {
            window.clienteObjetivoFlow = "cobro";
            if (typeof initModalClienteOpciones === "function") {
                const modalCli = document.getElementById("modalSeleccionarCliente");
                if (modalCli) modalCli.classList.remove("hidden");
            }
        };
    }

    // Escuchar selección de cliente
    window.addEventListener("clienteSeleccionado", (e) => {
        const { id, nombre, flow, data: clienteData } = e.detail;
        if (flow === "cobro") {
            clienteLocal = { id, nombre, email: clienteData?.email || null };
            if (labelClienteCobro) labelClienteCobro.textContent = nombre;
        } else {
            tpvState.clienteId = id;
            tpvState.clienteNombre = nombre;
        }
    });

    const handleNumInput = (val) => {
        if (metodoActual !== "efectivo") return;

        if (val === "C" || val === "Escape") {
            entregadoStr = "";
        } else if (val === "." || val === ",") {
            if (!entregadoStr.includes(".")) {
                entregadoStr += entregadoStr === "" ? "0." : ".";
            }
        } else if (val === "Backspace") {
            entregadoStr = entregadoStr.slice(0, -1);
        } else if (!isNaN(val) || val === "00") {
            if (entregadoStr.replace(".", "").length >= 8) return;

            let stringToAdd = val;
            if (entregadoStr.includes(".")) {
                const decimales = entregadoStr.split(".")[1] || "";
                if (val === "00") {
                    if (decimales.length >= 2) return;
                    if (decimales.length === 1) stringToAdd = "0";
                } else {
                    if (decimales.length >= 2) return;
                }
            } else {
                if (entregadoStr === "" && val === "00") return;
            }
            entregadoStr += stringToAdd;
        }
        if (inputEntregado) inputEntregado.value = entregadoStr || "0";
        actualizarCambio();
    };

    const handleKeydown = (e) => {
        if (modal.classList.contains("hidden")) return;
        const allowedKeys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", ",", "Backspace", "Escape", "Enter"];
        if (allowedKeys.includes(e.key)) {
            const active = document.activeElement;
            if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || active?.isContentEditable) return;

            e.preventDefault();
            if (e.key === "Enter") {
                procesarPago(true);
            } else {
                handleNumInput(e.key);
            }
        }
    };

    const cerrarModal = () => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", handleKeydown);
    };

    if (btnAbrirTotal) {
        btnAbrirTotal.onclick = () => {
            const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
            if (lineasActivas.length === 0) return;
            splittingLineas = null;
            forcedTotal = null;
            resetModal();
            modal.classList.remove("hidden");
            document.addEventListener("keydown", handleKeydown);
        };
    }

    if (btnCancelar) btnCancelar.onclick = cerrarModal;
    if (btnCerrarX) btnCerrarX.onclick = cerrarModal;

    [btnCancelar, btnCerrarX].forEach(b => { if (b) b.disabled = false; });

    metodos.forEach(m => {
        m.onclick = () => setMetodo(m.dataset.metodo);
    });

    if (keypad) {
        keypad.querySelectorAll(".cobro-key[data-key]").forEach(key => {
            key.onclick = () => handleNumInput(key.dataset.key);
        });
    }

    if (btnBack) btnBack.onclick = () => handleNumInput("Backspace");

    if (btnExacto) {
        btnExacto.onclick = () => {
            setMetodo("efectivo");
            entregadoStr = totalMesa.toFixed(2);
            if (inputEntregado) inputEntregado.value = entregadoStr;
            actualizarCambio();
        };
    }

    const procesarPago = async (imprimirTicket) => {
        if (isProcessing) return;

        const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
        if (lineasActivas.length === 0) {
            cerrarModal();
            return;
        }

        if (metodoActual === "efectivo" && entregadoStr) {
            const entregadoNum = parseFloat(entregadoStr);
            if (entregadoNum < totalMesa - 0.001) {
                await Notify.info("El importe entregado es inferior al total del documento.");
                return;
            }
        }

        isProcessing = true;
        btnConTicket.disabled = true;
        btnSinTicket.disabled = true;

        const operador = await window.TPVOperador?.require({
            title: gettext("Usuario para el cobro"),
            hint: gettext("Selecciona quien realiza este cobro.")
        });
        if (!operador) {
            isProcessing = false;
            btnConTicket.disabled = false;
            btnSinTicket.disabled = false;
            return;
        }

        const importeFinal = (metodoActual === "efectivo" && entregadoStr) ? parseFloat(entregadoStr) : totalMesa;

        const lineas = splittingLineas || tpvState.lineas.filter(l => !l.anulado).map(l => ({
            producto: l.producto_id,
            cantidad: l.cantidad,
            descuento: l.descuento || 0,
            id: l.id || undefined
        }));

        const payload = {
            lineas: lineas,
            metodo_pago: metodoActual,
            importe_entregado: importeFinal,
            imprimir_ticket: imprimirTicket,
            is_split: !!splittingLineas,
            cliente_id: clienteLocal?.id,
            cliente_email: clienteLocal?.email || null,
            operador_id: operador.id
        };

        try {
            await sincronizarComanda({ operador });

            const response = await fetch(`/api/mesas/${tpvState.mesaId}/cobrar/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCSRFToken()
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                console.error("Pago Error:", { status: response.status, payload, data });
                if (response.status === 400 && (data.detail?.includes("comanda") || data.detail?.includes("líneas"))) {
                    tpvState.lineas = [];
                    cerrarModal();
                    window.location.href = getTpvUrl();
                    return;
                }
                await Notify.error(data.detail || "Error en el cobro.");
                return;
            }

            if (splittingLineas) {
                clienteLocal = null;
                await cargarCatalogoTPV();
                cerrarModal();

                if (tpvState.lineas.filter(l => !l.anulado).length === 0) {
                    window.location.href = getTpvUrl();
                } else {
                    const btnAbrirSplit = document.getElementById("btnDividirCuenta");
                    if (btnAbrirSplit) btnAbrirSplit.click();
                }
            } else {
                tpvState.lineas = [];
                if (typeof renderTicket === "function") renderTicket();
                cerrarModal();
                window.location.href = getTpvUrl();
            }

            if (imprimirTicket && data && data.factura_id) {
                try {
                    const parts = window.location.pathname.split('/');
                    const tpvIndex = parts.indexOf('tpv');
                    if (tpvIndex !== -1) {
                        const basePath = parts.slice(0, tpvIndex + 1).join('/');
                        const ticketUrl = `${window.location.origin}${basePath}/ticket/${data.factura_id}/`;
                        window.open(ticketUrl, "_blank");
                    }
                } catch (e) { console.error(e); }
            }

            if (metodoActual === "efectivo" && data && data.cambio && parseFloat(data.cambio) > 0.001) {
                await Notify.info(`CAMBIO: ${parseFloat(data.cambio).toFixed(2).replace(".", ",")} €`, {
                    title: "Cambio",
                });
            }

        } catch (error) {
            console.error("Error cobro:", error);
            await Notify.error("Error de conexión al procesar el pago.", {
                title: "Error",
            });
        } finally {
            isProcessing = false;
            if (btnConTicket) btnConTicket.disabled = false;
            if (btnSinTicket) btnSinTicket.disabled = false;
        }
    };

    if (btnConTicket) btnConTicket.onclick = () => procesarPago(true);
    if (btnSinTicket) btnSinTicket.onclick = () => procesarPago(false);

    // Si viene con total forzado (cobro parcial), abrir directamente
    if (forcedTotal !== null) {
        resetModal();
        modal.classList.remove("hidden");
        document.addEventListener("keydown", handleKeydown);
    }
}
