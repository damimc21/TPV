// Carga de catálogo desde la API y sincronización con el servidor

let syncPromise = Promise.resolve();

// Carga departamentos, productos y comanda activa desde la API
async function cargarCatalogoTPV() {
    tpvState.isInitialLoading = true;

    try {
        const requests = [
            fetch('/api/departamentos/'),
            fetch('/api/productos/')
        ];

        if (tpvState.mesaNumero) {
            requests.push(
                fetch(`/api/mesas/abrir-comanda-por-numero/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken()
                    },
                    body: JSON.stringify({ numero: tpvState.mesaNumero })
                })
            );
        }

        const responses = await Promise.all(requests);
        const [resDeptos, resProds] = responses;

        let resComanda = null;
        if (responses.length > 2) resComanda = responses[2];

        if (!resDeptos.ok || !resProds.ok) throw new Error("Error al cargar el catálogo.");

        let deptosData = await resDeptos.json();
        let prodsData = await resProds.json();

        tpvState.departamentos = deptosData.results ? deptosData.results : deptosData;
        tpvState.productos = prodsData.results ? prodsData.results : prodsData;

        // Solo elementos activos
        tpvState.departamentos = tpvState.departamentos.filter(d => d.activo);
        tpvState.productos = tpvState.productos.filter(p => p.activo && !p.eliminado);

        if (tpvState.departamentos.length > 0) {
            tpvState.deptoActivo = tpvState.departamentos[0].id;
        }

        // Si hay una comanda abierta para esta mesa, cargamos sus líneas
        if (resComanda && resComanda.ok) {
            const dataMesa = await resComanda.json();

            if (dataMesa && dataMesa.mesa) {
                tpvState.mesaId = dataMesa.mesa.id;
                tpvState.mesaNumero = dataMesa.mesa.numero;
            }

            if (dataMesa && dataMesa.comanda && dataMesa.comanda.lineas) {
                tpvState.comandaId = dataMesa.comanda.id;

                if (dataMesa.cliente) {
                    tpvState.clienteId = dataMesa.cliente.id;
                    tpvState.clienteNombre = dataMesa.cliente.nombre;
                    setTimeout(() => { if (typeof actualizarUICliente === 'function') actualizarUICliente(); }, 100);
                }

                tpvState.lineas = dataMesa.comanda.lineas.map(ld => {
                    const l = {
                        id: ld.id,
                        producto_id: parseInt(ld.producto),
                        producto_nombre: ld.producto_nombre,
                        cantidad: Number(ld.cantidad),
                        precio_unitario: Number(ld.precio_unitario),
                        descuento: Number(ld.descuento || 0),
                        anulado: ld.anulado
                    };
                    recalcularLinea(l);
                    return l;
                });
                rehidratarLineas(tpvState.lineas);

                tpvState.historialInserciones = [];
                tpvState.lineas.forEach(l => {
                    for (let i = 0; i < l.cantidad; i++) {
                        tpvState.historialInserciones.push(l.producto_id);
                    }
                });
            } else {
                tpvState.comandaId = null;
                tpvState.lineas = [];
                tpvState.historialInserciones = [];
            }
        }

        renderDepartamentosTPV();
        renderProductosTPV();

    } catch (error) {
        console.error("Error inicializando TPV:", error);
        document.getElementById("listaDepartamentos").innerHTML = '<p style="color:red; padding:10px;">Error al cargar red.</p>';
    } finally {
        tpvState.isInitialLoading = false;
        renderTicket();
        if (typeof actualizarUICliente === 'function') actualizarUICliente();
        saveHistoryState(true);
        document.querySelector(".mesa")?.classList.remove("mesa--loading");
    }
}

// Botones de departamento
function renderDepartamentosTPV() {
    const contenedor = document.getElementById("listaDepartamentos");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    tpvState.departamentos.forEach(depto => {
        const btn = document.createElement("button");
        btn.className = "depto";
        btn.type = "button";
        btn.innerHTML = `<span style="font-weight: 700; width: 100%; text-align: left; padding-left: 5px;">${depto.nombre}</span>`;

        if (depto.id === tpvState.deptoActivo) {
            btn.classList.add("is-active");
        }

        btn.addEventListener("click", () => {
            tpvState.deptoActivo = depto.id;
            renderDepartamentosTPV();
            renderProductosTPV();
        });

        contenedor.appendChild(btn);
    });
}

// Cuadrícula de productos del departamento seleccionado
function renderProductosTPV() {
    const contenedor = document.getElementById("listaProductos");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    const filtrados = tpvState.productos.filter(p => p.departamento === tpvState.deptoActivo);

    if (filtrados.length === 0) {
        contenedor.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; color: var(--muted); text-align: center; font-weight: bold; border-radius: 12px; border: 2px dashed rgba(255,255,255,0.05);">No hay artículos activos en este departamento.</div>';
        return;
    }

    filtrados.forEach(prod => {
        const btn = document.createElement("button");
        btn.className = "producto";
        btn.type = "button";

        const hasImage = prod.icono_boton && prod.icono_boton.trim() !== '';

        // Fondo y texto base (personalización o backup)
        if (prod.color_boton && prod.color_boton !== "#000000" && prod.color_boton !== "") {
            // Aplicar fondo al contenedor principal sólo si no tiene imagen, para evitar bleed de anti-aliasing
            if (!hasImage) {
                btn.style.backgroundColor = prod.color_boton;
            }
        }
        if (prod.color_texto && prod.color_texto !== "#ffffff" && prod.color_texto !== "") {
            btn.style.color = prod.color_texto;
        }

        if (hasImage) {
            btn.classList.add("producto--con-imagen");
            btn.innerHTML = `
                <div class="producto__img-wrapper">
                    <img src="${prod.icono_boton}" alt="${prod.nombre}" onerror="this.style.display='none'; this.parentElement.style.backgroundColor='${prod.color_boton}';">
                </div>
                <div class="producto__precio-pill">${formatPrecio(prod.precio)}</div>
                <div class="producto__info">
                    <span class="producto__nombre">${prod.nombre}</span>
                </div>
            `;
        } else {
            btn.classList.add("producto--sin-imagen");
            btn.innerHTML = `
                <div class="producto__info producto__info--sin-imagen">
                    <span class="producto__nombre">${prod.nombre}</span>
                    <span class="producto__precio">${formatPrecio(prod.precio)}</span>
                </div>
            `;
        }

        btn.addEventListener("click", () => {
            agregarLineaComanda(prod);
        });

        contenedor.appendChild(btn);
    });
}

// Añade un producto al ticket o abre configuración
async function agregarLineaComanda(prod) {
    if (!tpvState.mesaNumero) {
        alert("Error: No hay mesa activa conectada.");
        return;
    }

    if (prod.es_configurable) {
        if (typeof abrirModalConfigurable === 'function') {
            abrirModalConfigurable(prod);
        } else {
            console.error("No se encontró abrirModalConfigurable");
            agregarLineaComandaNormal(prod);
        }
    } else {
        agregarLineaComandaNormal(prod);
    }
}

// Añade un producto normal sin configuración
async function agregarLineaComandaNormal(prod) {
    const lineaExistente = tpvState.lineas.find(l => l.producto_id === prod.id && !l.anulado && !l.configuracion_json);

    if (lineaExistente) {
        lineaExistente.cantidad += 1;
        recalcularLinea(lineaExistente);
    } else {
        const newLinea = {
            _uid: `l_${tpvState.nextLineaUid++}`,
            producto_id: prod.id,
            producto_nombre: prod.nombre,
            cantidad: 1,
            precio_unitario: parseFloat(prod.precio),
            descuento: 0,
            anulado: false
        };
        recalcularLinea(newLinea);
        tpvState.lineas.push(newLinea);
    }

    tpvState.historialInserciones.push(prod.id);

    renderTicket();
    saveHistoryState();
    await sincronizarComanda();
}

// Sincroniza el ticket con el servidor (cola de promesas para evitar conflictos)
async function sincronizarComanda() {
    const currentSync = syncPromise.then(async () => {
        if (!tpvState.mesaId) {
            if (!tpvState.mesaNumero) return;
            try {
                const resMesa = await fetch(`/api/mesas/abrir-comanda-por-numero/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken()
                    },
                    body: JSON.stringify({ numero: tpvState.mesaNumero })
                });
                if (resMesa.ok) {
                    const dataMesa = await resMesa.json().catch(() => null);
                    if (dataMesa && dataMesa.mesa) {
                        tpvState.mesaId = dataMesa.mesa.id;
                    }
                }
            } catch (e) {
                console.error("No se pudo inicializar la mesa para sincronizar:", e);
            }
            if (!tpvState.mesaId) return;
        }

        try {
            const payload = {
                lineas: tpvState.lineas.map(l => ({
                    id: l.id || null,
                    producto: l.producto_id,
                    cantidad: l.cantidad,
                    descuento: l.descuento || 0,
                    anulado: l.anulado
                }))
            };

            const res = await fetch(`/api/mesas/${tpvState.mesaId}/enviar/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                if (res.status === 404) {
                    tpvState.mesaId = null;
                    setTimeout(() => sincronizarComanda(), 0);
                } else {
                    console.error("Error al sincronizar la comanda con el servidor.", data);
                }
                return;
            }

            const comanda = (data && data.comanda) ? data.comanda : data;
            if (comanda && Array.isArray(comanda.lineas)) {
                tpvState.comandaId = comanda.id;
                const serverLineas = comanda.lineas;
                for (let i = 0; i < Math.min(tpvState.lineas.length, serverLineas.length); i++) {
                    tpvState.lineas[i].id = serverLineas[i].id;
                }
            }
        } catch (error) {
            console.error("Excepción en sincronizarComanda:", error);
        }
    });

    syncPromise = currentSync.catch(() => { });
    await currentSync;
}
