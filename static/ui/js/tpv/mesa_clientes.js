// Gestión de clientes: opciones, formulario ocasional/nuevo, buscador

function initModalClienteOpciones() {
    const modalOpciones = document.getElementById("modalSeleccionarCliente");
    const modalOcasional = document.getElementById("modalClienteOcasional");
    const modalBuscar = document.getElementById("modalBuscarClientes");

    const btnMesaCliente = document.getElementById("btnCliente");
    const labelClienteCobro = document.getElementById("cobroClienteNombre");

    const btnOcasional = document.getElementById("btnClienteOcasional");
    const btnNuevo = document.getElementById("btnNuevoCliente");
    const btnBuscar = document.getElementById("btnBuscarCliente");
    const btnCerrarOpciones = [
        document.getElementById("btnCerrarClienteOptions"),
        document.getElementById("btnCancelarClienteOptions")
    ];

    const formOcasional = document.getElementById("formClienteOcasional");

    const hideAll = () => {
        [modalOpciones, modalOcasional, modalBuscar].forEach(m => m?.classList.add("hidden"));
        if (formOcasional) formOcasional.reset();
        const inputBusq = document.getElementById("inputBuscarCliente");
        if (inputBusq) inputBusq.value = "";
    };

    if (btnMesaCliente) {
        btnMesaCliente.onclick = () => {
            window.clienteObjetivoFlow = "mesa";
            modalOpciones.classList.remove("hidden");
        };
    }

    btnCerrarOpciones.forEach(b => {
        if (b) b.onclick = hideAll;
    });

    // Selección de cliente → persistir en comanda
    window.addEventListener("clienteSeleccionado", async (e) => {
        const { id, nombre, flow, data: clienteData } = e.detail;

        tpvState.clienteId = id;
        tpvState.clienteNombre = nombre;
        tpvState.clienteEmail = clienteData?.email || null;

        if (flow === "mesa") {
            await persistirClienteEnComanda(id);
            actualizarUICliente();
        } else if (flow === "cobro") {
            if (labelClienteCobro) labelClienteCobro.textContent = nombre;
        }
    });

    async function persistirClienteEnComanda(clienteId) {
        if (!tpvState.mesaId) await sincronizarComanda();
        if (!tpvState.mesaId) return;

        try {
            const res = await fetch(`/api/mesas/${tpvState.mesaId}/asignar-cliente/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({ cliente_id: clienteId })
            });
            if (!res.ok) console.error("Error asignando cliente a comanda");
        } catch (err) {
            console.error(err);
        }
    }

    window.actualizarUICliente = actualizarUICliente;

    function actualizarUICliente() {
        const bar = document.getElementById("ticketCurrentClient");
        if (!bar) return;

        if (tpvState.clienteNombre) {
            bar.querySelector(".client-name").textContent = tpvState.clienteNombre;
            bar.classList.remove("hidden");

            bar.onclick = (e) => {
                if (e.target.closest('.client-badge') || e.target.classList.contains('client-name')) {
                    const modalOpc = document.getElementById("modalSeleccionarCliente");
                    if (modalOpc) {
                        window.clienteObjetivoFlow = "mesa";
                        modalOpc.classList.remove("hidden");
                    }
                }
            };
        } else {
            bar.classList.add("hidden");
        }
    }

    // Botón para quitar cliente
    const btnRemove = document.getElementById("btnRemoveClient");
    if (btnRemove) {
        btnRemove.onclick = async (e) => {
            e.stopPropagation();
            tpvState.clienteId = null;
            tpvState.clienteNombre = null;
            tpvState.clienteEmail = null;
            await persistirClienteEnComanda(null);
            actualizarUICliente();
        };
    }

    const footerForm = document.getElementById("footerClienteForm");

    const renderFooterButtons = (modo) => {
        if (!footerForm) return;
        if (modo === 'ocasional') {
            footerForm.innerHTML = `
                <button type="button" class="accion modal-btn-generic modal-btn-generic--cancel" onclick="hideAllClientes()">
                    ${gettext("Cancelar")}
                </button>
                <button type="submit" form="formClienteOcasional" class="accion modal-btn-generic modal-btn-generic--save">
                    ${gettext("Aceptar")}
                </button>
            `;
        } else {
            footerForm.innerHTML = `
                <button type="button" class="accion modal-btn-generic modal-btn-generic--cancel" onclick="hideAllClientes()">
                    ${gettext("Cancelar")}
                </button>
                <button type="button" class="accion modal-btn-generic" id="btnSoloRegistrar">
                    ${gettext("Registrar")}
                </button>
                <button type="button" class="accion modal-btn-generic modal-btn-generic--save" id="btnRegistrarYUsar">
                    ${gettext("Registrar y usar")}
                </button>
            `;
            document.getElementById("btnSoloRegistrar").onclick = () => submitForm("registro_solo");
            document.getElementById("btnRegistrarYUsar").onclick = () => submitForm("registro_y_usar");
        }
    };

    window.hideAllClientes = hideAll;

    const submitForm = (actionType) => {
        const inputs = Array.from(formOcasional.querySelectorAll("input[required]"));
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add("invalid-field");
                isValid = false;
                input.oninput = () => {
                    if (input.value.trim()) input.classList.remove("invalid-field");
                };
            } else {
                input.classList.remove("invalid-field");
            }
        });

        if (!isValid) return;

        const formData = new FormData(formOcasional);
        const data = Object.fromEntries(formData);
        const flow = window.clienteObjetivoFlow || "mesa";
        const isRegistro = formOcasional.dataset.tipo === "registro";

        if (isRegistro) {
            fetch('/api/clientes/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify(data)
            })
            .then(res => res.json())
            .then(cliente => {
                if (cliente.id) {
                    if (actionType === "registro_y_usar") {
                        window.dispatchEvent(new CustomEvent("clienteSeleccionado", {
                            detail: { id: cliente.id, nombre: cliente.nombre, flow: flow, data: cliente }
                        }));
                    } else {
                        window.Notify.success(gettext("Cliente registrado correctamente"));
                    }
                    hideAll();
                    formOcasional.reset();
                } else {
                    window.Notify.error(gettext("Error al registrar cliente"));
                }
            })
            .catch(err => {
                console.error(err);
                window.Notify.error(gettext("Error de conexión"));
            });
        } else {
            window.dispatchEvent(new CustomEvent("clienteSeleccionado", {
                detail: {
                    id: "ocasional_form",
                    nombre: data.nombre,
                    flow: flow,
                    action: actionType,
                    data: data
                }
            }));
            hideAll();
            formOcasional.reset();
        }
    };

    // 1. Cliente ocasional / datos factura
    if (btnOcasional) {
        btnOcasional.onclick = () => {
            hideAll();
            const title = modalOcasional.querySelector("h2");
            if (title) title.textContent = gettext("Datos de Facturación");
            renderFooterButtons('ocasional');
            modalOcasional.classList.remove("hidden");
            if (formOcasional) formOcasional.dataset.tipo = "ocasional";
        };
    }

    const btnCerrarOcasionalX = document.getElementById("btnCerrarOcasional");
    if (btnCerrarOcasionalX) btnCerrarOcasionalX.onclick = hideAll;

    if (formOcasional) {
        formOcasional.onsubmit = (e) => {
            e.preventDefault();
            submitForm("ocasional");
        };
    }

    // 2. Nuevo cliente (alta)
    if (btnNuevo) {
        btnNuevo.onclick = () => {
            hideAll();
            const title = modalOcasional.querySelector("h2");
            if (title) title.textContent = gettext("Alta Cliente");
            renderFooterButtons('registro');
            modalOcasional.classList.remove("hidden");
            if (formOcasional) formOcasional.dataset.tipo = "registro";
        };
    }

    // 3. Buscador de clientes
    if (btnBuscar) {
        btnBuscar.onclick = () => {
            hideAll();
            modalBuscar.classList.remove("hidden");
            initBuscadorClientes();
        };
    }

    const btnCerrarBuscar = [
        document.getElementById("btnCerrarBuscarClientes"),
        document.getElementById("btnCerrarModalBuscar")
    ];
    btnCerrarBuscar.forEach(b => {
        if (b) b.onclick = hideAll;
    });
}

function initBuscadorClientes() {
    const input = document.getElementById("inputBuscarCliente");
    const containerAbc = document.getElementById("listaAbc");
    const containerResultados = document.getElementById("listaResultadosClientes");

    if (containerAbc && containerAbc.innerHTML === "") {
        const letras = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
        letras.forEach(l => {
            const span = document.createElement("span");
            span.className = "abc-item";
            span.textContent = l;
            span.onclick = () => {
                input.value = l;
                input.dispatchEvent(new Event('input'));
            };
            containerAbc.appendChild(span);
        });
    }

    if (input) {
        input.oninput = async () => {
            const query = input.value.toLowerCase();
            fetchClientes(query);
        };
        fetchClientes(input.value || "");
    }

    async function fetchClientes(query) {
        try {
            const url = query ? `/api/clientes/?q=${encodeURIComponent(query)}` : '/api/clientes/';
            const response = await fetch(url);
            const data = await response.json();
            renderResultadosReales(data);
        } catch (err) {
            console.error("Error buscando clientes:", err);
            containerResultados.innerHTML = `<div class="buscador-vacio">${gettext("Error de conexión")}</div>`;
        }
    }

    function renderResultadosReales(clientes) {
        if (clientes.length === 0) {
            containerResultados.innerHTML = `<div class="buscador-vacio">${gettext("Sin resultados")}</div>`;
            return;
        }

        containerResultados.innerHTML = clientes.map(c => `
            <div class="resultado-cliente-item" onclick="seleccionarClienteBuscado(${c.id}, '${c.nombre.replace(/'/g, "\\'")}')">
                <div class="resultado-cliente-main">
                    <strong>${c.nombre}</strong>
                    <span>${c.nif || ''}</span>
                </div>
                <div class="resultado-cliente-extra">
                    ${c.email ? `<span class="cliente-tag email">📧</span>` : ''}
                    ${c.telefono ? `<span class="cliente-tag tlf">📞</span>` : ''}
                </div>
            </div>
        `).join("");
    }
}

window.seleccionarClienteBuscado = (id, nombre) => {
    const flow = window.clienteObjetivoFlow || "mesa";
    window.dispatchEvent(new CustomEvent("clienteSeleccionado", {
        detail: { id: id, nombre: nombre, flow: flow }
    }));
    document.getElementById("modalBuscarClientes").classList.add("hidden");
};
