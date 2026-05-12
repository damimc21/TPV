export function getCookie(name) {
    return typeof window !== 'undefined' && window.TpvUtils
        ? window.TpvUtils.getCookie(name)
        : null;
}

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
