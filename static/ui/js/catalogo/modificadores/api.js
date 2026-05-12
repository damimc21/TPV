import { csrfHeaders, jsonHeaders } from './utils.js';

export const ENDPOINTS = {
    departamentos: '/api/departamentos/',
    productos: '/api/productos/',
    perfilesComentarios: '/api/perfiles-comentarios/',
    comentarios: '/api/comentarios/',
    perfilesSuplementos: '/api/perfiles-suplementos/',
    suplementos: '/api/suplementos/',
};

async function fetchJson(url) {
    const resp = await fetch(url);
    return resp.json();
}

export async function loadModificadoresData() {
    const [
        departamentos,
        productos,
        perfilesComentarios,
        comentarios,
        perfilesSuplementos,
        suplementos,
    ] = await Promise.all([
        fetchJson(ENDPOINTS.departamentos),
        fetchJson(ENDPOINTS.productos),
        fetchJson(ENDPOINTS.perfilesComentarios),
        fetchJson(ENDPOINTS.comentarios),
        fetchJson(ENDPOINTS.perfilesSuplementos),
        fetchJson(ENDPOINTS.suplementos),
    ]);

    return {
        departamentos,
        productos,
        perfilesComentarios,
        comentarios,
        perfilesSuplementos,
        suplementos,
    };
}

export const loadDepartamentosProductos = () => Promise.all([
    fetchJson(ENDPOINTS.departamentos),
    fetchJson(ENDPOINTS.productos),
]);

export const loadPerfilesComentarios = () => fetchJson(ENDPOINTS.perfilesComentarios);
export const loadComentarios = () => fetchJson(ENDPOINTS.comentarios);
export const loadPerfilesSuplementos = () => fetchJson(ENDPOINTS.perfilesSuplementos);
export const loadSuplementos = () => fetchJson(ENDPOINTS.suplementos);

export async function saveResource(baseUrl, id, payload) {
    const resp = await fetch(id ? `${baseUrl}${id}/` : baseUrl, {
        method: id ? 'PUT' : 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('Error al guardar');
    return resp;
}

export async function deleteResource(baseUrl, id) {
    return fetch(`${baseUrl}${id}/`, {
        method: 'DELETE',
        headers: csrfHeaders(),
    });
}
