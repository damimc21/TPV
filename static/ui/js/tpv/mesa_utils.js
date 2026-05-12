// Utilidades compartidas para la pantalla de mesa

const tpvMesaConfig = window.readJsonScript
    ? window.readJsonScript('tpv-mesa-config', {})
    : {};

window.MESA_NUMERO = window.MESA_NUMERO ?? tpvMesaConfig.mesaNumero ?? null;
window.TPV_TERMINAL_ID = window.TPV_TERMINAL_ID ?? tpvMesaConfig.terminalId ?? "1";
window.TPV_CONEXION = window.TPV_CONEXION ?? tpvMesaConfig.conexion ?? "LOCAL";
window.TPV_CAJA_ESTADO = window.TPV_CAJA_ESTADO ?? tpvMesaConfig.cajaEstado ?? "—";
window.TPV_JORNADA_ESTADO = window.TPV_JORNADA_ESTADO ?? tpvMesaConfig.jornadaEstado ?? "—";
window.TPV_INDEX_URL = window.TPV_INDEX_URL ?? tpvMesaConfig.indexUrl ?? "/";

// Fallback para gettext si no está cargado el catálogo de Django
if (typeof gettext === 'undefined') {
    window.gettext = function (text) { return text; };
}

// Token CSRF para peticiones POST
function getCSRFToken() {
    return window.TpvUtils ? window.TpvUtils.getCSRFToken() : "";
}

// Prefijo de idioma actual y rutas TPV sin fijar /es/ a mano
function getLocaleBasePath() {
    const match = window.location.pathname.match(/^\/([a-z]{2})(?=\/|$)/i);
    return match ? `/${match[1]}` : "";
}

function getTpvUrl(path = "") {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return `${getLocaleBasePath()}/tpv/${cleanPath}`;
}

// Formato de precio en euros
function formatPrecio(precioStr) {
    const val = parseFloat(precioStr);
    if (isNaN(val)) {
        return window.TPVI18n ? window.TPVI18n.formatCurrency(0) : "0,00 €";
    }
    if (window.TPVI18n) {
        return window.TPVI18n.formatCurrency(val);
    }
    return val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Traducción de nombres internos de modificadores/herramientas
function getDisplayModifierName(name) {
    if (name === '__MANUAL_TEXT__') return gettext('Comentario libre');
    if (name === '__MANUAL_PRICE__') return gettext('Comodín');
    return name;
}

// Los métodos showConfirm y showAlert ahora son globales en modals.js
const showAlerta = showAlert;

// --- Bloqueo de scroll automático ---
(function() {
    const observer = new MutationObserver(() => {
        const anyModalVisible = !!document.querySelector('.modal:not(.hidden), .modal-mesa:not(.hidden), .modal-overlay-generic:not(.hidden)');
        document.body.style.overflow = anyModalVisible ? 'hidden' : '';
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
})();

// --- Gestión de Entrada Manual (Herramientas) ---
let manualInputPromise = null;

function initModalInputManual() {
    const modal = document.getElementById('modalInputManual');
    if (!modal) return;

    const btnCerrar = document.getElementById('btnCerrarManualInput');
    const btnCancelar = document.getElementById('btnCancelarManualInput');
    const btnAceptar = document.getElementById('btnAceptarManualInput');

    const displayPrice = document.getElementById('manualInputPriceDisplay');
    const textArea = document.getElementById('manualInputTextArea');

    const close = (val = null) => {
        modal.classList.add('hidden');
        if (manualInputPromise) manualInputPromise(val);
        manualInputPromise = null;
    };

    btnCerrar.onclick = () => close();
    btnCancelar.onclick = () => close();
    btnAceptar.onclick = () => {
        const type = modal._type;
        if (type === 'price') {
            const price = displayPrice.value.replace(',', '.');
            const name = document.getElementById('manualInputPriceName').value.trim();
            close({ precio: price, nombre: name });
        } else {
            close(textArea.value.trim());
        }
    };

    // Keypad Logic
    document.querySelectorAll('.manual-key').forEach(btn => {
        btn.onclick = () => {
            const val = btn.dataset.val;
            let current = displayPrice.value.replace(',', '');
            if (current === "000") current = "";

            if (current.length < 6) {
                current += val;
                const padded = current.padStart(3, '0');
                const integer = padded.substring(0, padded.length - 2);
                const decimal = padded.substring(padded.length - 2);
                displayPrice.value = `${parseInt(integer, 10)},${decimal}`;
            }
        };
    });

    document.getElementById('btnCManualInput').onclick = () => {
        displayPrice.value = "0,00";
    };

    document.getElementById('btnBackManualInput').onclick = () => {
        let current = displayPrice.value.replace(',', '');
        current = current.slice(0, -1);
        const padded = current.padStart(3, '0');
        const integer = padded.substring(0, padded.length - 2);
        const decimal = padded.substring(padded.length - 2);
        displayPrice.value = `${parseInt(integer, 10)},${decimal}`;
    };
}

/**
 * Abre el modal de entrada manual y devuelve una promesa con el valor.
 * @param {string} type - 'text' o 'price'
 * @param {string} title - Título del modal
 */
function showManualInputModal(type, title, initialValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalInputManual');
        if (!modal) return resolve(null);

        manualInputPromise = resolve;
        modal._type = type;
        document.getElementById('manualInputTitle').textContent = title;

        const textCont = document.getElementById('manualInputTextContainer');
        const priceCont = document.getElementById('manualInputPriceContainer');
        const textArea = document.getElementById('manualInputTextArea');
        const displayPrice = document.getElementById('manualInputPriceDisplay');

        if (type === 'price') {
            textCont.classList.add('hidden');
            priceCont.classList.remove('hidden');
            displayPrice.value = initialValue ? initialValue.replace('.', ',') : "0,00";
            const nameInput = document.getElementById('manualInputPriceName');
            if (nameInput) {
                nameInput.value = '';
                setTimeout(() => nameInput.focus(), 150);
            }
        } else {
            priceCont.classList.add('hidden');
            textCont.classList.remove('hidden');
            textArea.value = initialValue;
            setTimeout(() => textArea.focus(), 100);
        }

        modal.classList.remove('hidden');
    });
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', initModalInputManual);
