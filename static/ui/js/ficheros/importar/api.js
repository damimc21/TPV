const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

export async function previewUploadedFile(file, importType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipo', importType);

    const resp = await fetch('/api/ficheros/importar-previsualizar/', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken() },
        body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || gettext('No se pudo previsualizar el fichero.'));
    return data;
}

export async function verifyImportRows(importType, rows) {
    const resp = await fetch('/api/ficheros/importar-verificar/', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ tipo: importType, rows }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || gettext('No se pudo verificar el fichero.'));
    return data;
}

export async function importRows(importType, rows, options) {
    const endpoint = importType === 'productos'
        ? '/api/ficheros/importar-productos/'
        : '/api/ficheros/importar-inventario/';

    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
            rows,
            opciones: options || {},
        }),
    });
    const data = await resp.json();
    return { ok: resp.ok, data };
}

export function buildTemplateUrl(importType, format) {
    return `/api/ficheros/importar-plantilla/?tipo=${encodeURIComponent(importType)}&format=${encodeURIComponent(format)}`;
}

function getCSRFToken() {
    return window.TpvUtils ? window.TpvUtils.getCSRFToken() : '';
}

function jsonHeaders() {
    return window.TpvUtils
        ? window.TpvUtils.jsonHeaders()
        : { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() };
}
