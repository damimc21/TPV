export async function fetchDepartamentos() {
    const resp = await fetch('/api/departamentos/');
    if (!resp.ok) throw new Error('Error en API departamentos');
    return resp.json();
}

export function saveDepartamentoApi(id, payload) {
    return fetch(id ? `/api/departamentos/${id}/` : '/api/departamentos/', {
        method: id ? 'PUT' : 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
    });
}

export function deleteDepartamentoApi(id) {
    return fetch(`/api/departamentos/${id}/`, {
        method: 'DELETE',
        headers: csrfHeaders(),
    });
}

export async function fetchImpresoras() {
    const resp = await fetch('/api/impresoras/');
    if (!resp.ok) throw new Error('Error en API impresoras');
    return resp.json();
}

export async function fetchProductos() {
    const resp = await fetch('/api/productos/');
    if (!resp.ok) throw new Error('Error en API productos');
    return resp.json();
}

export function saveProductoApi(id, payload) {
    return fetch(id ? `/api/productos/${id}/` : '/api/productos/', {
        method: id ? 'PUT' : 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
    });
}

export function deleteProductoApi(id) {
    return fetch(`/api/productos/${id}/`, {
        method: 'DELETE',
        headers: csrfHeaders(),
    });
}

function csrfHeaders() {
    return getTpvUtils()
        ? getTpvUtils().csrfHeaders()
        : { 'X-CSRFToken': getCSRFToken() };
}

function jsonHeaders() {
    return getTpvUtils()
        ? getTpvUtils().jsonHeaders()
        : { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() };
}

function getCSRFToken() {
    return getTpvUtils() ? getTpvUtils().getCSRFToken() : '';
}

function getTpvUtils() {
    return typeof window !== 'undefined' ? window.TpvUtils : null;
}
