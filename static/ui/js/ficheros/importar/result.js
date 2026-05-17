import { escHtml } from './render_utils.js';

const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

export function showImportResult(result) {
    const data = result.data || {};
    showResultStep();

    if (result.ok) {
        document.getElementById('resultSummary').innerHTML = `
            <div class="fich-result-icon">OK</div>
            <h3 class="fich-result-title">${gettext('Importación completada')}</h3>
            <p class="fich-result-detail">
                ${data.creados || 0} ${gettext('creados')} - ${data.actualizados || 0} ${gettext('actualizados')} - ${data.errores || 0} ${gettext('errores')}
            </p>
        `;
    } else {
        document.getElementById('resultSummary').innerHTML = `
            <div class="fich-result-icon">ERROR</div>
            <h3 class="fich-result-title">${gettext('Error en la importación')}</h3>
            <p class="fich-result-detail">${escHtml(data.error || gettext('Error desconocido'))}</p>
        `;
    }
}

export function showConnectionError() {
    showResultStep();
    document.getElementById('resultSummary').innerHTML = `
        <div class="fich-result-icon">ERROR</div>
        <h3 class="fich-result-title">${gettext('Error de conexión')}</h3>
        <p class="fich-result-detail">${gettext('No se pudo contactar con el servidor.')}</p>
    `;
}

function showResultStep() {
    document.getElementById('stepPreview').classList.add('hidden');
    document.getElementById('stepResult').classList.remove('hidden');
}
