import { escHtml } from './render_utils.js';

export function showImportResult(result) {
    const data = result.data || {};
    showResultStep();

    if (result.ok) {
        document.getElementById('resultSummary').innerHTML = `
            <div class="fich-result-icon">OK</div>
            <h3 class="fich-result-title">Importacion completada</h3>
            <p class="fich-result-detail">
                ${data.creados || 0} creados - ${data.actualizados || 0} actualizados - ${data.errores || 0} errores
            </p>
        `;
    } else {
        document.getElementById('resultSummary').innerHTML = `
            <div class="fich-result-icon">ERROR</div>
            <h3 class="fich-result-title">Error en la importacion</h3>
            <p class="fich-result-detail">${escHtml(data.error || 'Error desconocido')}</p>
        `;
    }
}

export function showConnectionError() {
    showResultStep();
    document.getElementById('resultSummary').innerHTML = `
        <div class="fich-result-icon">ERROR</div>
        <h3 class="fich-result-title">Error de conexion</h3>
        <p class="fich-result-detail">No se pudo contactar con el servidor.</p>
    `;
}

function showResultStep() {
    document.getElementById('stepPreview').classList.add('hidden');
    document.getElementById('stepResult').classList.remove('hidden');
}
