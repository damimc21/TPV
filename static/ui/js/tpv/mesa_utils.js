// Utilidades compartidas para la pantalla de mesa

// Fallback para gettext si no está cargado el catálogo de Django
if (typeof gettext === 'undefined') {
    window.gettext = function (text) { return text; };
}

// Token CSRF para peticiones POST
function getCSRFToken() {
    let csrftoken = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, 10) === ('csrftoken=')) {
                csrftoken = decodeURIComponent(cookie.substring(10));
                break;
            }
        }
    }
    return csrftoken;
}

// Formato de precio en euros
function formatPrecio(precioStr) {
    const val = parseFloat(precioStr);
    if (isNaN(val)) return "0,00 €";
    return val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Reemplazo de window.confirm con el modal del sistema
function showConfirm(mensaje) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modalConfirmarGenerico");
        const msgEl = document.getElementById("confirmGenericoMsg");
        const btnOk = document.getElementById("btnConfirmGenericoOk");
        const btnCancel = document.getElementById("btnConfirmGenericoCancel");

        if (!modal || !msgEl || !btnOk || !btnCancel) {
            resolve(confirm(mensaje));
            return;
        }

        msgEl.textContent = mensaje;
        modal.classList.remove("hidden");

        const onOk = () => {
            modal.classList.add("hidden");
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            modal.classList.add("hidden");
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            btnOk.removeEventListener("click", onOk);
            btnCancel.removeEventListener("click", onCancel);
        };

        btnOk.addEventListener("click", onOk);
        btnCancel.addEventListener("click", onCancel);
    });
}

// Reemplazo de window.alert con el modal del sistema
function showAlert(mensaje) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modalAlertaGenerico");
        const msgEl = document.getElementById("alertGenericoMsg");
        const btnOk = document.getElementById("btnAlertGenericoOk");

        if (!modal || !msgEl || !btnOk) {
            alert(mensaje);
            resolve();
            return;
        }

        msgEl.textContent = mensaje;
        modal.classList.remove("hidden");

        const onOk = () => {
            modal.classList.add("hidden");
            btnOk.removeEventListener("click", onOk);
            resolve();
        };

        btnOk.addEventListener("click", onOk);
    });
}

// --- Bloqueo de scroll automático ---
(function() {
    const observer = new MutationObserver(() => {
        const anyModalVisible = !!document.querySelector('.modal:not(.hidden), .modal-mesa:not(.hidden), .modal-overlay-generic:not(.hidden)');
        document.body.style.overflow = anyModalVisible ? 'hidden' : '';
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
})();
