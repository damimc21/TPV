// Modal de dividir cuenta (cobro parcial por líneas)

function initModalDividirCuenta() {
    const modal = document.getElementById("modalDividirCuenta");
    const btnAbrir = document.getElementById("btnDividirCuenta");
    const btnCerrar = document.getElementById("btnCerrarSplit");
    const btnCancelar = document.getElementById("btnCancelarSplit");
    const btnCobrar = document.getElementById("btnCobrarSplit");
    const listado = document.getElementById("splitItemsList");
    const displayTotal = document.getElementById("splitTotalValor");
    const statsLines = document.getElementById("splitStatsLines");
    const statsItems = document.getElementById("splitStatsItems");

    if (!modal || !btnAbrir) return;

    let seleccionMap = new Map();

    const fmt = (v) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

    const calcularTotalesActuales = () => {
        let total = 0;
        let lineas = 0;
        let articulos = 0;

        seleccionMap.forEach((qty, uid) => {
            const linea = tpvState.lineas.find(l => l._uid === uid);
            if (linea && qty > 0) {
                total += (linea.precio_unitario * qty) * (1 - (linea.descuento || 0) / 100);
                lineas++;
                articulos += qty;
            }
        });

        return { total, lineas, articulos };
    };

    const render = () => {
        listado.innerHTML = "";
        const lineasActivas = tpvState.lineas.filter(l => !l.anulado);

        if (lineasActivas.length === 0) {
            listado.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted); font-size:1.2rem;">No hay productos activos en la mesa</div>`;
        }

        lineasActivas.forEach(l => {
            const qtySeleccionada = seleccionMap.get(l._uid) || 0;

            const itemDiv = document.createElement("div");
            itemDiv.className = "split-item";
            if (qtySeleccionada > 0) itemDiv.classList.add("is-selected");

            const totalLineaSel = (l.precio_unitario * qtySeleccionada) * (1 - (l.descuento || 0) / 100);

            itemDiv.innerHTML = `
                <div class="split-item__check-col">
                    <div class="split-item__check">${qtySeleccionada > 0 ? '✓' : ''}</div>
                </div>
                <div class="split-item__content">
                    <div class="split-item__main-info">
                        <span class="split-item__name">${l.producto_nombre}</span>
                        <span class="split-item__qty-summary">${qtySeleccionada} de ${l.cantidad} unidad(es)</span>
                    </div>
                    <div class="split-item__controls">
                        <button class="split-qty-btn minus" title="Quitar unidad" ${qtySeleccionada <= 0 ? 'disabled' : ''}>−</button>
                        <span class="split-qty-val">${qtySeleccionada}</span>
                        <button class="split-qty-btn plus" title="Añadir unidad" ${qtySeleccionada >= l.cantidad ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="split-item__price-info">
                        <span class="split-item__total">${fmt(totalLineaSel)}</span>
                        <span class="split-item__unit-price">${fmt(l.precio_unitario)}/u</span>
                    </div>
                </div>
            `;

            // Click en el cuerpo togglea todo o nada
            itemDiv.onclick = (e) => {
                if (e.target.closest('.split-item__controls')) return;
                if (qtySeleccionada < l.cantidad) {
                    seleccionMap.set(l._uid, l.cantidad);
                } else {
                    seleccionMap.set(l._uid, 0);
                }
                render();
            };

            const btnMinus = itemDiv.querySelector(".minus");
            const btnPlus = itemDiv.querySelector(".plus");
            const qtyText = itemDiv.querySelector(".split-qty-val");

            btnMinus.onclick = (e) => {
                e.stopPropagation();
                if (qtySeleccionada > 0) {
                    seleccionMap.set(l._uid, qtySeleccionada - 1);
                    render();
                }
            };

            btnPlus.onclick = (e) => {
                e.stopPropagation();
                if (qtySeleccionada < l.cantidad) {
                    seleccionMap.set(l._uid, qtySeleccionada + 1);
                    render();
                }
            };

            qtyText.onclick = (e) => {
                e.stopPropagation();
                window.lineaEditandoSplitUid = l._uid;
                const mQty = document.getElementById("modalCantidadCustom");
                const dQty = document.getElementById("modalCantidadCustomDisplay");
                if (mQty && dQty) {
                    dQty.value = "";
                    mQty.classList.remove("hidden");
                }
            };

            listado.appendChild(itemDiv);
        });

        if (!window.hasSplitQtyListener) {
            window.addEventListener('updateSplitQty', (e) => {
                const { uid, qty } = e.detail;
                seleccionMap.set(uid, qty);
                render();
            });
            window.hasSplitQtyListener = true;
        }

        const resumen = calcularTotalesActuales();
        if (displayTotal) displayTotal.textContent = fmt(resumen.total);
        if (statsLines) statsLines.querySelector("b").textContent = resumen.lineas;
        if (statsItems) statsItems.querySelector("b").textContent = resumen.articulos;

        btnCobrar.disabled = resumen.total <= 0;
        btnCobrar.innerHTML = gettext("Cobrar");
    };

    btnAbrir.onclick = () => {
        if (tpvState.lineas.filter(l => !l.anulado).length === 0) return;
        seleccionMap.clear();
        modal.classList.remove("hidden");
        render();
    };

    const cerrar = () => modal.classList.add("hidden");
    [btnCerrar, btnCancelar].forEach(b => { if (b) b.onclick = cerrar; });

    btnCobrar.onclick = () => {
        const resumen = calcularTotalesActuales();
        if (resumen.total <= 0) return;

        cerrar();
        const totalSplitLineas = [];
        seleccionMap.forEach((qty, uid) => {
            const linea = tpvState.lineas.find(l => l._uid === uid);
            if (linea && qty > 0) {
                totalSplitLineas.push({
                    producto: linea.producto_id,
                    cantidad: qty,
                    descuento: linea.descuento || 0,
                    id: linea.id || undefined
                });
            }
        });

        if (typeof initModalCobro === "function") {
            initModalCobro(resumen.total, totalSplitLineas);
        }
    };
}
