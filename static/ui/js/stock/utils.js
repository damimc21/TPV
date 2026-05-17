const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

export const UNIT_OPTIONS = [
    ['ud', gettext('Unidades')],
    ['pack', gettext('Packs')],
    ['caja', gettext('Cajas')],
    ['kg', gettext('Kilos')],
    ['g', gettext('Gramos')],
    ['l', gettext('Litros')],
    ['ml', gettext('Mililitros')],
];

export function getStockState(art) {
    const sActual = parseFloat(art.stock_actual);
    const sMin = parseFloat(art.stock_minimo);
    if (sActual < 0) return 'review';
    if (sActual === 0) return 'out';
    if (sMin > 0 && sActual <= sMin) return 'low';
    return 'ok';
}

export function getStateLabel(state) {
    return {
        ok: gettext('En stock'),
        low: gettext('Stock bajo'),
        out: gettext('Agotado'),
        review: gettext('Revisar'),
    }[state];
}

export function getUnitString(u) {
    return { ud: 'ud', pack: 'pack', caja: 'caja', kg: 'kg', g: 'g', l: 'L', ml: 'ml' }[u] || u;
}

export function getStepForUnit(u) {
    if (u === 'kg' || u === 'l') return 0.5;
    if (u === 'g' || u === 'ml') return 100;
    return 1;
}

export function getUnitOptionsHtml(selected) {
    const defaultUnit = UNIT_OPTIONS.some(([value]) => value === selected) ? selected : 'ud';
    return UNIT_OPTIONS.map(([value, label]) => (
        `<option value="${value}" ${value === defaultUnit ? 'selected' : ''}>${label}</option>`
    )).join('');
}

export function formatStockValue(val) {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return '0';
    return n % 1 === 0 ? n.toString() : n.toFixed(2);
}

export function parseDecimalInput(value) {
    return parseFloat(String(value || '').replace(',', '.'));
}

export function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function getCookie(name) {
    return typeof window !== 'undefined' && window.TpvUtils
        ? window.TpvUtils.getCookie(name)
        : null;
}
