export function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function getCsrfToken() {
    return window.TpvUtils
        ? window.TpvUtils.getCSRFToken()
        : document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || '';
}

export function jsonHeaders() {
    return window.TpvUtils
        ? window.TpvUtils.jsonHeaders()
        : { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() };
}

export function csrfHeaders() {
    return window.TpvUtils
        ? window.TpvUtils.csrfHeaders()
        : { 'X-CSRFToken': getCsrfToken() };
}
