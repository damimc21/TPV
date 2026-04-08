// Modal de descuento (porcentaje personalizado o preset)

function abrirModalDescuento() {
    const modal = document.getElementById("modalDescuento");
    const display = document.getElementById("modalDescuentoDisplay");
    const title = document.getElementById("modalDescuentoTitle");
    const btnCerrar = document.getElementById("btnCerrarModalDescuento");
    const btnC = document.getElementById("btnCModalDescuento");
    const btnBack = document.getElementById("btnBackModalDescuento");
    const btnGo = document.getElementById("btnGoModalDescuento");
    const presets = document.querySelectorAll(".btn-descuento-preset");
    const keys = document.querySelectorAll(".btn-descuento-key");

    if (!modal || !display) return;

    display.value = "0";
    modal.classList.remove("hidden");

    if (window.descuentoObjetivo === "toda-la-mesa") {
        title.textContent = "Descuento a toda la mesa";
    } else {
        title.textContent = "Descuento a selección";
    }

    const cerrar = () => {
        modal.classList.add("hidden");
        window.descuentoObjetivo = null;
    };

    btnCerrar.onclick = cerrar;
    btnC.onclick = () => { display.value = "0"; };

    btnBack.onclick = () => {
        if (display.value.length > 0) display.value = display.value.slice(0, -1);
        if (display.value === "") display.value = "0";
    };

    keys.forEach(btn => {
        btn.onclick = () => {
            const val = btn.getAttribute("data-val");
            const next = (display.value === "0") ? val : display.value + val;
            if (parseInt(next, 10) <= 100) display.value = next;
        };
    });

    presets.forEach(btn => {
        btn.onclick = () => {
            display.value = btn.getAttribute("data-val");
            btnGo.click();
        };
    });

    btnGo.onclick = async () => {
        const desc = parseInt(display.value, 10);
        if (isNaN(desc) || desc < 0 || desc > 100) {
            await showAlert("Descuento no válido (0-100)");
            return;
        }

        let objetivo = [];
        if (window.descuentoObjetivo === "toda-la-mesa") {
            objetivo = tpvState.lineas.filter(l => !l.anulado);
        } else {
            objetivo = getLineasSeleccionadasActivas();
        }

        objetivo.forEach(linea => {
            linea.descuento = desc;
            recalcularLinea(linea);
        });

        limpiarSeleccionLineas();
        renderTicket();
        cerrar();
        saveHistoryState();
        await sincronizarComanda();
    };
}
