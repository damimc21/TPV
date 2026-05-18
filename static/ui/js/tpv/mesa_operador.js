// Selector central de operador TPV para acciones auditables.

(function () {
    if (typeof gettext === "undefined") {
        window.gettext = function (text) { return text; };
    }

    const STORAGE_KEY = "tpv_operador_actual";
    const modal = document.getElementById("modalOperadorTPV");
    const modalPanel = modal?.querySelector(".modal-container-generic--operador");
    const grid = document.getElementById("operadorGrid");
    const empty = document.getElementById("operadorEmpty");
    const title = document.getElementById("operadorModalTitle");
    const hint = document.getElementById("operadorModalHint");
    const btnCerrar = document.getElementById("btnCerrarOperadorTPV");
    const btnCancelar = document.getElementById("btnCancelarOperadorTPV");
    const empleadoActual = document.getElementById("empleadoActual");

    let operadores = null;
    let pendingResolve = null;
    let allowCancelCurrent = true;

    window.TPV_OPERATOR_STATE = window.TPV_OPERATOR_STATE || {
        operadorId: null,
        operadorNombre: null
    };

    function getState() {
        return typeof tpvState !== "undefined" ? tpvState : window.TPV_OPERATOR_STATE;
    }

    function safeGetSaved() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        } catch (_) {
            return null;
        }
    }

    function safeSave(user) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                id: user.id,
                nombre: user.nombre,
                username: user.username,
                iniciales: user.iniciales
            }));
        } catch (_) { }
    }

    function updateCurrentUser(user) {
        if (!user) return;
        const state = getState();
        state.operadorId = user.id;
        state.operadorNombre = user.nombre || user.username;
        window.TPV_OPERATOR_STATE.operadorId = state.operadorId;
        window.TPV_OPERATOR_STATE.operadorNombre = state.operadorNombre;
        safeSave(user);

        if (empleadoActual) {
            empleadoActual.textContent = (state.operadorNombre || user.username || "").toUpperCase();
            empleadoActual.title = gettext("Operador TPV seleccionado");
        }
    }

    async function loadOperadores(force = false) {
        if (operadores && !force) return operadores;

        const response = await fetch("/api/tpv/operadores/", {
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        operadores = Array.isArray(data) ? data : [];
        return operadores;
    }

    function closeModal(result = null) {
        if (!result && !allowCancelCurrent) return;
        if (modal) {
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");
        }
        if (pendingResolve) pendingResolve(result);
        pendingResolve = null;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderOperadores() {
        if (!grid || !empty) return;

        const saved = safeGetSaved();
        const state = getState();
        const savedId = Number(saved?.id || state.operadorId || 0);
        const count = (operadores || []).length;

        grid.innerHTML = "";
        grid.classList.toggle("operador-modal__grid--list", count <= 4);
        grid.classList.toggle("operador-modal__grid--mixed", count > 4);
        modalPanel?.classList.toggle("is-mixed", count > 4);
        empty.classList.toggle("hidden", operadores && operadores.length > 0);

        (operadores || []).forEach((user) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "operador-card";
            if (Number(user.id) === savedId) btn.classList.add("is-active");

            const nombre = user.nombre || user.username;
            btn.innerHTML = `
                <span class="operador-card__avatar">${escapeHtml(user.iniciales || nombre.slice(0, 2).toUpperCase())}</span>
                <span class="operador-card__text">
                    <strong>${escapeHtml(nombre)}</strong>
                    <small>${escapeHtml(user.username || "")}</small>
                </span>
            `;
            btn.addEventListener("click", () => {
                updateCurrentUser(user);
                closeModal(user);
            });
            grid.appendChild(btn);
        });
    }

    async function requireOperador(options = {}) {
        if (!modal) return null;
        allowCancelCurrent = options.allowCancel !== false;

        try {
            await loadOperadores();
        } catch (error) {
            console.error("No se pudo cargar la lista de operadores TPV:", error);
            if (window.Notify) {
                await window.Notify.error(gettext("No se pudo cargar la lista de usuarios TPV."));
            }
            return null;
        }

        if (title) title.textContent = options.title || gettext("Seleccionar usuario");
        if (hint) hint.textContent = options.hint || gettext("Elige el usuario que realizara esta accion.");

        renderOperadores();

        modal.classList.remove("hidden");
        modal.setAttribute("aria-hidden", "false");

        return new Promise((resolve) => {
            pendingResolve = resolve;
            requestAnimationFrame(() => {
                const active = grid?.querySelector(".operador-card.is-active") || grid?.querySelector(".operador-card");
                active?.focus();
            });
        });
    }

    if (btnCerrar) btnCerrar.addEventListener("click", () => closeModal(null));
    if (btnCancelar) btnCancelar.addEventListener("click", () => closeModal(null));

    document.addEventListener("keydown", (event) => {
        if (!modal || modal.classList.contains("hidden")) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeModal(null);
        }
    });

    document.addEventListener("DOMContentLoaded", () => {
        const saved = safeGetSaved();
        if (saved) updateCurrentUser(saved);
    });

    window.TPVOperador = {
        require: requireOperador,
        current() {
            const state = getState();
            return state.operadorId ? {
                id: state.operadorId,
                nombre: state.operadorNombre
            } : null;
        },
        payload() {
            const state = getState();
            return state.operadorId ? { operador_id: state.operadorId } : {};
        },
        refresh() {
            operadores = null;
            return loadOperadores(true);
        }
    };
})();
