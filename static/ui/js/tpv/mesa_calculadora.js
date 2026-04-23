// Calculadora numérica, modal mesa/traspasar, modal cantidad y teclado físico

// Modal cantidad personalizada (teclado numérico para cambiar unidades)
const modalCantidad = document.getElementById("modalCantidadCustom");
const displayCantidad = document.getElementById("modalCantidadCustomDisplay");
const btnCerrarCantidad = document.getElementById("btnCerrarModalCantidad");
const btnCCantidad = document.getElementById("btnCModalCantidad");
const btnBackCantidad = document.getElementById("btnBackModalCantidad");
const btnGoCantidad = document.getElementById("btnGoModalCantidad");
const teclasCantidad = document.querySelectorAll(".btn-qty-key");

if (modalCantidad && displayCantidad) {
    const cerrarModalCantidad = () => {
        modalCantidad.classList.add("hidden");
        window.lineaEditandoCantidadUid = null;
        displayCantidad.value = "";
    };

    if (btnCerrarCantidad) btnCerrarCantidad.addEventListener("click", cerrarModalCantidad);

    if (btnBackCantidad) {
        btnBackCantidad.addEventListener("click", () => {
            if (displayCantidad.value.length > 0) {
                displayCantidad.value = displayCantidad.value.slice(0, -1);
            }
            if (displayCantidad.value === "") {
                displayCantidad.value = "0";
            }
        });
    }

    teclasCantidad.forEach(tecla => {
        tecla.addEventListener("click", () => {
            const val = tecla.getAttribute("data-val");
            if (displayCantidad.value === "0" || displayCantidad.value === "") {
                displayCantidad.value = val;
            } else {
                if (displayCantidad.value.length < 3) {
                    displayCantidad.value += val;
                }
            }
        });
    });

    if (btnCCantidad) {
        btnCCantidad.addEventListener("click", () => {
            displayCantidad.value = "";
        });
    }

    if (btnGoCantidad) {
        btnGoCantidad.addEventListener("click", async () => {
            const newQty = parseInt(displayCantidad.value, 10);

            // Si venimos de dividir cuenta, actualizamos la cantidad del split
            if (window.lineaEditandoSplitUid) {
                const uid = window.lineaEditandoSplitUid;
                const linea = tpvState.lineas.find(l => l._uid === uid);
                if (linea) {
                    const finalQty = Math.max(0, Math.min(newQty, linea.cantidad));
                    window.dispatchEvent(new CustomEvent('updateSplitQty', {
                        detail: { uid: uid, qty: finalQty }
                    }));
                }
                cerrarModalCantidad();
                window.lineaEditandoSplitUid = null;
                return;
            }

            const uid = window.lineaEditandoCantidadUid;
            if (!uid) {
                cerrarModalCantidad();
                return;
            }

            const targetIndex = tpvState.lineas.findIndex(l => l._uid === uid);
            if (targetIndex !== -1) {
                const linea = tpvState.lineas[targetIndex];
                if (!isNaN(newQty) && newQty > 0) {
                    linea.cantidad = newQty;
                    linea.total = linea.cantidad * linea.precio_unitario;
                } else if (newQty === 0) {
                    eliminarLineaPorIndice(targetIndex);
                }
                renderTicket();
                cerrarModalCantidad();
                saveHistoryState();
                await sincronizarComanda();
            } else {
                cerrarModalCantidad();
            }
        });
    }
}

// Calculadora principal y modal de mesa/traspasar
function initCalculator() {
    const display = document.getElementById("calcDisplay");
    const historial = document.getElementById("calcHistorial");
    const teclas = document.querySelectorAll(".calc__tecla");

    let currentValue = '0';
    let previousValue = null;
    let operator = null;
    let waitingForNewValue = false;

    // Abre una mesa por número
    const abrirMesaPorNumero = async (num, displayElement) => {
        try {
            const res = await fetch(`/api/mesas/abrir-comanda-por-numero/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({ numero: num })
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.mesa && data.mesa.numero) {
                    window.location.href = getTpvUrl(`mesa/${data.mesa.numero}/`);
                }
            } else {
                throw new Error("HTTP " + res.status);
            }
        } catch (e) {
            console.error('Error abriendo mesa:', e);
            if (displayElement) {
                displayElement.style.color = '#ff3b30';
                displayElement.classList.add("shake-animation");
                setTimeout(() => displayElement.classList.remove("shake-animation"), 300);
                setTimeout(() => { displayElement.style.color = ''; }, 600);
            }
        }
    };

    // Modal de mesa / traspasar
    const modalMesa = document.getElementById("modalMesa");
    const modalDisplay = document.getElementById("modalMesaDisplay");
    let modalValue = "";
    let modalAction = "mesa";
    const btnBackModalMesa = document.getElementById("btnBackModalMesa");

    const cerrarModalMesa = () => {
        if (modalMesa) modalMesa.classList.add("hidden");
        modalValue = "";
        if (modalDisplay) modalDisplay.value = "";
        modalAction = "mesa";
        actualizarModalMesa("mesa");
    };

    // Traspasa productos a otra mesa
    const ejecutarTraspaso = async (destinoNum, displayElement) => {
        if (!tpvState.mesaId || !destinoNum || Number(destinoNum) === Number(tpvState.mesaNumero)) return;
        const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
        if (lineasActivas.length === 0) return;

        const seleccionadas = getLineasSeleccionadasActivas();
        const payload = { destino_numero: Number(destinoNum) };

        if (seleccionadas.length > 0) {
            payload.lineas = seleccionadas.map((l) => ({ producto: l.producto_id, cantidad: l.cantidad, descuento: l.descuento || 0 }));
        } else {
            payload.lineas = lineasActivas.map((l) => ({ producto: l.producto_id, cantidad: l.cantidad, descuento: l.descuento || 0 }));
        }

        try {
            await sincronizarComanda();
            const res = await fetch(`/api/mesas/${tpvState.mesaId}/traspasar/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

            if (seleccionadas.length > 0) {
                const productosSeleccionados = new Set(seleccionadas.map(l => l.producto_id));
                tpvState.lineas = tpvState.lineas.filter(l => !productosSeleccionados.has(l.producto_id));
            } else {
                tpvState.lineas = [];
            }
            limpiarSeleccionLineas();
            tpvState.historialInserciones = tpvState.lineas.flatMap(l => Array.from({ length: l.cantidad }, () => l.producto_id));
            renderTicket();
            await sincronizarComanda();
        } catch (e) {
            console.error('Error traspasando mesa:', e);
            if (displayElement) {
                displayElement.style.color = '#ff3b30';
                setTimeout(() => { displayElement.style.color = ''; }, 600);
            }
        }
    };

    const btnCerrarModal = document.getElementById("btnCerrarModalMesa");
    if (btnCerrarModal && modalMesa) {
        btnCerrarModal.addEventListener("click", cerrarModalMesa);
    }

    if (btnBackModalMesa) {
        btnBackModalMesa.addEventListener("click", () => {
            if (modalValue.length > 0) modalValue = modalValue.slice(0, -1);
            if (modalDisplay) modalDisplay.value = modalValue;
        });
    }

    const modalTeclas = document.querySelectorAll("#modalMesa .modal-mesa__tecla[data-val]");
    modalTeclas.forEach(t => {
        t.addEventListener("click", () => {
            const val = t.dataset.val;
            if (val === "C") {
                modalValue = "";
            } else if (val !== undefined && val !== null && modalValue.length < 3) {
                modalValue += val;
            }
            if (modalDisplay) modalDisplay.value = modalValue;
        });
    });

    const btnGoModalMesa = document.getElementById("btnGoModalMesa");
    let isProcessingMesaAction = false;

    if (btnGoModalMesa && modalDisplay) {
        btnGoModalMesa.addEventListener("click", async () => {
            if (isProcessingMesaAction) return;
            isProcessingMesaAction = true;
            btnGoModalMesa.style.opacity = "0.5";
            btnGoModalMesa.style.pointerEvents = "none";

            try {
                const mNum = parseInt(modalValue, 10);
                if (isNaN(mNum) || mNum < 1 || mNum > 999) {
                    cerrarModalMesa();
                    return;
                }

                if (modalAction === "traspasar") {
                    const checkRes = await fetch(`/api/mesas/abrir-comanda-por-numero/`, {
                        method: 'POST',
                        body: JSON.stringify({ numero: mNum }),
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCSRFToken()
                        }
                    });

                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        if (checkData.comanda) {
                            cerrarModalMesa();
                            if (!await window.Notify.confirm("La mesa tiene productos dentro ¿Quieres juntar las mesas?", { title: "Confirmar" })) {
                                return;
                            }
                        }
                    }

                    await ejecutarTraspaso(mNum, modalDisplay);
                    cerrarModalMesa();
                } else {
                    abrirMesaPorNumero(mNum, modalDisplay);
                }
            } finally {
                isProcessingMesaAction = false;
                btnGoModalMesa.style.opacity = "1";
                btnGoModalMesa.style.pointerEvents = "auto";
            }
        });
    }

    const abrirModalMesa = (modo = "mesa") => {
        if (!modalMesa) return;
        modalAction = modo;
        modalValue = "";
        if (modalDisplay) modalDisplay.value = "";
        actualizarModalMesa(modo);
        modalMesa.classList.remove("hidden");
    };

    const btnMesa = document.getElementById("btnMesa");
    if (btnMesa) {
        btnMesa.addEventListener('click', () => {
            if (currentValue === '0' && previousValue === null && operator === null) {
                abrirModalMesa("mesa");
                return;
            }
            const num = parseInt(currentValue, 10);
            if (!isNaN(num) && num >= 1 && num <= 999) {
                abrirMesaPorNumero(num, display);
            }
        });
    }

    const btnTraspasar = document.getElementById("btnTraspasar");
    if (btnTraspasar) {
        btnTraspasar.addEventListener('click', async () => {
            const lineasActivas = tpvState.lineas.filter(l => !l.anulado);
            if (lineasActivas.length === 0) return;

            if (currentValue === '0' && previousValue === null && operator === null) {
                abrirModalMesa("traspasar");
                return;
            }

            const num = parseInt(currentValue, 10);
            if (!isNaN(num) && num >= 1 && num <= 999) {
                await ejecutarTraspaso(num, display);
                currentValue = '0';
                previousValue = null;
                operator = null;
                waitingForNewValue = false;
                updateDisplay();
                return;
            }

            abrirModalMesa("traspasar");
        });
    }

    if (!display || !teclas.length) return;

    const updateDisplay = () => {
        display.value = currentValue.substring(0, 15);
        if (historial) {
            if (operator && previousValue !== null) {
                historial.textContent = `${previousValue} ${operator}`;
            } else {
                historial.textContent = '';
            }
        }
    };

    const calculate = (a, b, op) => {
        const n1 = parseFloat(a);
        const n2 = parseFloat(b);
        if (isNaN(n1) || isNaN(n2)) return b;

        switch (op) {
            case '+': return (n1 + n2).toString();
            case '-': return (n1 - n2).toString();
            case '×': return (n1 * n2).toString();
            case '÷': return n2 === 0 ? '0' : (n1 / n2).toString();
            default: return b;
        }
    };

    teclas.forEach(tecla => {
        tecla.addEventListener('click', () => {
            const val = tecla.dataset.calc;
            if (!val) return;

            if (/^[0-9]+$/.test(val) || val === '00' || val === '.') {
                if (waitingForNewValue) {
                    currentValue = val === '.' ? '0.' : val;
                    waitingForNewValue = false;
                } else {
                    if (val === '.') {
                        if (!currentValue.includes('.')) {
                            currentValue += '.';
                        }
                    } else {
                        currentValue = currentValue === '0' ? val : currentValue + val;
                    }
                }
            }
            else if (val === 'C') {
                currentValue = '0';
                previousValue = null;
                operator = null;
                waitingForNewValue = false;
            }
            else if (val === 'back') {
                if (!waitingForNewValue) {
                    currentValue = currentValue.slice(0, -1);
                    if (currentValue === '' || currentValue === '-') {
                        currentValue = '0';
                    }
                }
            }
            else if (val === '%') {
                currentValue = (parseFloat(currentValue) / 100).toString();
                waitingForNewValue = true;
            }
            else if (val === '=') {
                if (operator && previousValue !== null) {
                    currentValue = calculate(previousValue, currentValue, operator);
                    previousValue = null;
                    operator = null;
                    waitingForNewValue = true;
                }
            }
            else {
                if (operator && !waitingForNewValue && previousValue !== null) {
                    currentValue = calculate(previousValue, currentValue, operator);
                    updateDisplay();
                }
                previousValue = currentValue;
                operator = val;
                waitingForNewValue = true;
                updateDisplay();
                return;
            }

            updateDisplay();
        });
    });

    // Teclado físico → calculadora y modales
    document.addEventListener("keydown", async (e) => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;

        const key = e.key;

        // Modal cantidad
        const modalCantidadVisible = modalCantidad && !modalCantidad.classList.contains("hidden");
        if (modalCantidadVisible) {
            if (/^[0-9]$/.test(key)) {
                if (displayCantidad.value === "0" || displayCantidad.value === "") {
                    displayCantidad.value = key;
                } else if (displayCantidad.value.length < 3) {
                    displayCantidad.value += key;
                }
                e.preventDefault();
                return;
            }
            if (key === "Backspace") {
                if (displayCantidad.value.length > 0) {
                    displayCantidad.value = displayCantidad.value.slice(0, -1);
                }
                if (displayCantidad.value === "") displayCantidad.value = "0";
                e.preventDefault();
                return;
            }
            if (key === "Escape" || key === "Delete" || key === "Del") {
                displayCantidad.value = "";
                e.preventDefault();
                return;
            }
            if (key === "Enter") {
                btnGoCantidad?.click();
                e.preventDefault();
                return;
            }
            return;
        }

        // Modal descuento
        const modalDescuentoVisible = document.getElementById("modalDescuento") && !document.getElementById("modalDescuento").classList.contains("hidden");
        if (modalDescuentoVisible) {
            const d = document.getElementById("modalDescuentoDisplay");
            if (/^[0-9]$/.test(key)) {
                const next = (d.value === "0") ? key : d.value + key;
                if (parseInt(next, 10) <= 100) d.value = next;
                e.preventDefault(); return;
            }
            if (key === "Backspace") {
                d.value = d.value.length > 1 ? d.value.slice(0, -1) : "0";
                e.preventDefault(); return;
            }
            if (key === "Escape" || key === "Delete" || key === "Del") {
                d.value = "0"; e.preventDefault(); return;
            }
            if (key === "Enter") {
                document.getElementById("btnGoModalDescuento")?.click();
                e.preventDefault(); return;
            }
            return;
        }

        // Modal mesa
        const modalMesaVisible = modalMesa && !modalMesa.classList.contains("hidden");
        if (modalMesaVisible) {
            if (/^[0-9]$/.test(key)) {
                if (modalValue.length < 3) {
                    modalValue += key;
                    if (modalDisplay) modalDisplay.value = modalValue;
                }
                e.preventDefault();
                return;
            }
            if (key === "Backspace") {
                if (modalValue.length > 0) {
                    modalValue = modalValue.slice(0, -1);
                    if (modalDisplay) modalDisplay.value = modalValue;
                }
                e.preventDefault();
                return;
            }
            if (key === "Escape" || key === "Delete" || key === "Del") {
                modalValue = "";
                if (modalDisplay) modalDisplay.value = "";
                e.preventDefault();
                return;
            }
            if (key === "Enter") {
                e.preventDefault();
                const mNum = parseInt(modalValue, 10);
                if (isNaN(mNum) || mNum < 1 || mNum > 999) {
                    cerrarModalMesa();
                    return;
                }
                if (modalAction === "traspasar") {
                    await ejecutarTraspaso(mNum, modalDisplay);
                    cerrarModalMesa();
                } else {
                    abrirMesaPorNumero(mNum, modalDisplay);
                }
                return;
            }
            return;
        }

        // Calculadora
        let calcKey = null;
        if (/^[0-9]$/.test(key)) calcKey = key;
        else if (key === "." || key === ",") calcKey = ".";
        else if (key === "+") calcKey = "+";
        else if (key === "-") calcKey = "-";
        else if (key === "*") calcKey = "×";
        else if (key === "/") calcKey = "÷";
        else if (key === "Enter") {
            if (document.getElementById("modalCobro") && !document.getElementById("modalCobro").classList.contains("hidden")) {
                return;
            }
            calcKey = "=";
        }
        else if (key === "Backspace") calcKey = "back";
        else if (key === "Escape" || key === "Delete" || key === "Del") calcKey = "C";

        if (!calcKey) return;

        const btn = document.querySelector(`.calc__tecla[data-calc="${calcKey}"]`);
        if (btn) {
            btn.click();
            e.preventDefault();
        }
    });

    updateDisplay();
}
