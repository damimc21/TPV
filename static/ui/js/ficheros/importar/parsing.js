export const HEADERS_PRODUCTOS = [
    'nombre',
    'departamento',
    'precio',
    'activo',
    'nombre_factura',
    'nombre_comanda',
];

export const HEADERS_INVENTARIO = [
    'nombre',
    'categoria',
    'unidad',
    'stock_actual',
    'stock_minimo',
    'proveedor',
    'precio_compra',
];

export const COLOR_HEADERS = ['color_boton', 'color_texto'];

export function normalizeHeader(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

export function parseCsvText(text) {
    let source = String(text || '');
    if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);

    const rawLines = source.split(/\r?\n/).filter((line) => line.trim());
    if (rawLines.length < 2) {
        return {
            headers: [],
            rows: [],
            errors: ['El fichero esta vacio o solo contiene cabeceras.'],
        };
    }

    const delimiter = rawLines[0].includes(';') ? ';' : ',';
    const headers = parseCsvLine(rawLines[0], delimiter).map(normalizeHeader);
    const rows = rawLines.slice(1).map((line, index) => {
        const values = parseCsvLine(line, delimiter);
        const row = {};
        headers.forEach((header, colIndex) => {
            row[header] = values[colIndex] || '';
        });
        row._line = index + 2;
        return row;
    });

    return { headers, rows, errors: [] };
}

export function hasText(value) {
    return String(value ?? '').trim() !== '';
}

export function parseDecimalValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    let text = raw.replace(/\s+/g, '');
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        const decimalSep = lastComma > lastDot ? ',' : '.';
        const splitAt = decimalSep === ',' ? lastComma : lastDot;
        const whole = text.slice(0, splitAt).replace(/[.,]/g, '');
        const cents = text.slice(splitAt + 1);
        text = `${whole}.${cents}`;
    } else if (lastComma >= 0) {
        text = text.replace(',', '.');
    }

    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

export function formatDecimalValue(value, decimals = 2) {
    const number = parseDecimalValue(value);
    return number === null ? null : number.toFixed(decimals);
}

export function normalizeHexColor(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return null;

    let hex = match[1].toLowerCase();
    if (hex.length === 3) {
        hex = hex.split('').map((char) => char + char).join('');
    }
    return `#${hex}`;
}

export function isColorHeader(header) {
    return COLOR_HEADERS.includes(header);
}

function parseCsvLine(line, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    values.push(current.trim());
    return values;
}
