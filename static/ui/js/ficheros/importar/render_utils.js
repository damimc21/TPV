export function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function safeClassName(value) {
    return String(value || '').replace(/[^a-z0-9_-]/gi, '') || 'ok';
}

export function formatNameSample(names, total) {
    if (!Array.isArray(names) || names.length === 0) return '';
    const shown = names.slice(0, 5).join(', ');
    return total > names.length ? `${shown}...` : shown;
}
