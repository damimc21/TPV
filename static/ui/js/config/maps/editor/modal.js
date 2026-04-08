/* modal.js — Sistema de modales para el editor de mapas
   Reemplaza los nativos alert(), confirm() y prompt() con
   diálogos coherentes con el tema dark del editor.
   Los estilos están en map_editor.css (sección "Modales").
*/

// ─── Helpers ─────────────────────────────────────────────────

function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    return overlay;
}

function createCard(title, message) {
    const card = document.createElement("div");
    card.className = "modal-card";

    if (title) {
        const h = document.createElement("div");
        h.className = "modal-title";
        h.textContent = title;
        card.appendChild(h);
    }

    if (message) {
        const p = document.createElement("div");
        p.className = "modal-message";
        p.textContent = message;
        card.appendChild(p);
    }

    return card;
}

function createBtn(text, className = "") {
    const btn = document.createElement("button");
    btn.className = `modal-btn ${className}`.trim();
    btn.type = "button";
    btn.textContent = text;
    return btn;
}

// ─── Modal API ───────────────────────────────────────────────

/**
 * Reemplazo de alert(). Muestra un mensaje con botón "Aceptar".
 * @param {string} message
 * @param {string} [title]
 * @returns {Promise<void>}
 */
export function showAlert(message, title = "") {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const card = createCard(title, message);
        const actions = document.createElement("div");
        actions.className = "modal-actions";

        const btnOk = createBtn("Aceptar", "modal-btn--primary");
        actions.appendChild(btnOk);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
            resolve();
        }

        btnOk.addEventListener("click", close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
        btnOk.focus();
    });
}

/**
 * Reemplazo de confirm(). Muestra mensaje con "Cancelar" / "Aceptar".
 * @param {string} message
 * @param {Object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.okText]
 * @param {string} [opts.cancelText]
 * @param {boolean} [opts.danger] - estilo rojo para acciones destructivas
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, opts = {}) {
    const { title = "", okText = "Aceptar", cancelText = "Cancelar", danger = false } = opts;

    return new Promise((resolve) => {
        const overlay = createOverlay();
        const card = createCard(title, message);
        const actions = document.createElement("div");
        actions.className = "modal-actions";

        const btnCancel = createBtn(cancelText);
        const btnOk = createBtn(okText, danger ? "modal-btn--danger" : "modal-btn--primary");

        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function close(result) {
            overlay.remove();
            resolve(result);
        }

        btnOk.addEventListener("click", () => close(true));
        btnCancel.addEventListener("click", () => close(false));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });

        function onKey(e) {
            if (e.key === "Escape") { close(false); window.removeEventListener("keydown", onKey); }
            if (e.key === "Enter") { close(true); window.removeEventListener("keydown", onKey); }
        }
        window.addEventListener("keydown", onKey);

        btnOk.focus();
    });
}

/**
 * Reemplazo de prompt(). Muestra input con "Cancelar" / "Aceptar".
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {Object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.placeholder]
 * @returns {Promise<string|null>}  null si se cancela
 */
export function showPrompt(message, defaultValue = "", opts = {}) {
    const { title = "", placeholder = "" } = opts;

    return new Promise((resolve) => {
        const overlay = createOverlay();
        const card = createCard(title, message);

        const input = document.createElement("input");
        input.type = "text";
        input.className = "modal-input";
        input.value = defaultValue;
        if (placeholder) input.placeholder = placeholder;
        card.appendChild(input);

        const actions = document.createElement("div");
        actions.className = "modal-actions";

        const btnCancel = createBtn("Cancelar");
        const btnOk = createBtn("Aceptar", "modal-btn--primary");

        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        card.appendChild(actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function close(result) {
            overlay.remove();
            resolve(result);
        }

        btnOk.addEventListener("click", () => close(input.value));
        btnCancel.addEventListener("click", () => close(null));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); close(input.value); }
            if (e.key === "Escape") { e.preventDefault(); close(null); }
        });

        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}
