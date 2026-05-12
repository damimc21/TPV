import {
    COLOR_HEADERS,
    HEADERS_INVENTARIO,
    HEADERS_PRODUCTOS,
    formatDecimalValue,
    hasText,
    normalizeHexColor,
} from './parsing.js';

export function validateImportRows({ importType, parsedHeaders, parsedRows }) {
    const errors = [];
    let warnings = [];
    let hasBlockingErrors = false;
    const expected = importType === 'productos' ? HEADERS_PRODUCTOS : HEADERS_INVENTARIO;

    function addFileError(message, blocking = true) {
        if (!errors.includes(message)) {
            errors.push(message);
        }
        if (blocking) {
            hasBlockingErrors = true;
        }
    }

    if (!parsedHeaders.includes('nombre')) {
        addFileError('Falta la columna obligatoria "nombre".');
    }

    if (importType === 'inventario' && parsedHeaders.includes('departamento')) {
        errors.push('Parece que has subido una plantilla de productos en la secciÃ³n de inventario. Verifica el fichero.');
    }

    if (importType === 'productos' && (parsedHeaders.includes('categoria') || parsedHeaders.includes('stock_actual')) && !parsedHeaders.includes('departamento')) {
        errors.push('Parece que has subido una plantilla de inventario en la secciÃ³n de productos. Verifica el fichero.');
    }

    if (importType === 'productos' && !parsedHeaders.includes('departamento')) {
        errors.push('Falta la columna obligatoria "departamento". Todo producto debe pertenecer a un departamento.');
    }
    if (importType === 'inventario' && !parsedHeaders.includes('categoria')) {
        addFileError('Falta la columna obligatoria "categoria". La plantilla no encaja con inventario.');
    }
    if (parsedRows.length === 0) {
        errors.push('El fichero no contiene filas de datos.');
    }
    if (errors.length > 0) {
        hasBlockingErrors = true;
    }

    expected.forEach((header) => {
        if (importType !== 'productos' && !['nombre', 'categoria'].includes(header) && !parsedHeaders.includes(header)) {
            warnings.push(`Columna opcional no encontrada: ${header}. Se aplicara el valor por defecto.`);
        }
    });

    if (importType === 'productos') {
        if (!parsedHeaders.includes('activo')) {
            warnings.push('No hay columna activo: los productos validos se importaran como activos (1/true).');
        }
        if (!parsedHeaders.includes('nombre_factura')) {
            warnings.push('No hay nombre_factura: se usara el nombre del producto en factura.');
        }
        if (!parsedHeaders.includes('nombre_comanda')) {
            warnings.push('No hay nombre_comanda: se usara el nombre del producto en comandas.');
        }
        if (!parsedHeaders.includes('color_boton') && !parsedHeaders.includes('color_texto')) {
            warnings.push('La plantilla basica no incluye colores: los productos nuevos usaran colores por defecto.');
        }
        if (parsedHeaders.includes('eliminado')) {
            warnings.push('La columna eliminado no se importa en modo basico; se gestiona desde Catalogo.');
        }
        if (parsedHeaders.includes('imagen') || parsedHeaders.includes('icono_boton')) {
            warnings.push('Las imagenes no se importan desde esta plantilla; se mantienen las existentes al actualizar.');
        }
    }
    if (hasBlockingErrors) {
        warnings = [];
    }

    parsedRows.forEach((row) => {
        row._valid = true;
        row._error = '';
        row._errors = [];

        if (!hasText(row.nombre)) {
            addRowError(row, 'Falta el nombre obligatorio.');
        }

        if (importType === 'productos') {
            validateProductRow(row);
        } else {
            validateInventoryRow(row);
        }
    });

    if (hasBlockingErrors) {
        const message = importType === 'productos'
            ? 'La plantilla no encaja con productos.'
            : 'La plantilla no encaja con inventario.';
        parsedRows.forEach((row) => {
            if (rowErrorList(row).length === 0) {
                addRowError(row, message);
            }
        });
    }

    return {
        errors,
        warnings,
        hasBlockingErrors,
        validRows: hasBlockingErrors ? [] : parsedRows.filter((row) => row._valid),
    };
}

export function applyProductPreviewDefaults({ importType, parsedHeaders, parsedRows, warnings, fillProductDisplayNames }) {
    parsedRows.forEach((row) => {
        row._displayValues = {};
        row._importValues = {};
        row._defaultedFields = {};
        row._normalizedFields = {};
    });

    if (importType !== 'productos') return warnings;

    const counters = {
        facturaDefaults: 0,
        comandaDefaults: 0,
        facturaBlanks: 0,
        comandaBlanks: 0,
        priceDefaults: 0,
        priceNormalized: 0,
        activeDefaults: 0,
        colorValues: 0,
        colorNormalized: 0,
    };

    parsedRows.forEach((row) => {
        if (!row._valid || !hasText(row.nombre)) return;

        applyPriceDefault(row, parsedHeaders, counters);
        applyActiveDefault(row, parsedHeaders, counters);
        applyColorDefaults(row, parsedHeaders, counters);
        applyDisplayNameDefaults(row, parsedHeaders, fillProductDisplayNames, counters);
    });

    pushDefaultWarnings(warnings, counters, fillProductDisplayNames);
    return warnings;
}

export function addRowError(row, message) {
    if (!row._errors) row._errors = [];
    if (!row._errors.includes(message)) {
        row._errors.push(message);
    }
    row._valid = false;
    row._error = row._errors.join(' | ');
}

export function rowErrorList(row) {
    if (Array.isArray(row._errors) && row._errors.length > 0) return row._errors;
    return row._error ? [row._error] : [];
}

function validateProductRow(row) {
    if (!hasText(row.departamento)) {
        addRowError(row, 'Falta el departamento obligatorio.');
    }
    if (hasText(row.precio) && formatDecimalValue(row.precio) === null) {
        addRowError(row, 'Precio invalido.');
    }
    if (hasText(row.activo)) {
        const activoVal = String(row.activo).trim().toLowerCase();
        const validBooleans = ['1', '0', 'true', 'false', 'si', 'no', 'yes', 'activo', 'inactivo'];
        if (!validBooleans.includes(activoVal)) {
            addRowError(row, 'Valor de activo invalido. Usa: 1/0, true/false, si/no o activo/inactivo.');
        }
    }
    COLOR_HEADERS.forEach((field) => {
        if (hasText(row[field]) && normalizeHexColor(row[field]) === null) {
            addRowError(row, `${field} invalido. Usa un color hexadecimal, por ejemplo #2ecc71.`);
        }
    });
}

function validateInventoryRow(row) {
    ['stock_actual', 'stock_minimo', 'precio_compra'].forEach((field) => {
        if (hasText(row[field]) && formatDecimalValue(row[field]) === null) {
            addRowError(row, `${field} invalido.`);
        }
    });
}

function applyPriceDefault(row, parsedHeaders, counters) {
    if (!parsedHeaders.includes('precio')) return;

    const normalizedPrice = hasText(row.precio) ? formatDecimalValue(row.precio) : '0.00';
    if (normalizedPrice === null) return;

    row._displayValues.precio = normalizedPrice;
    row._importValues.precio = normalizedPrice;
    if (!hasText(row.precio)) {
        row._defaultedFields.precio = true;
        counters.priceDefaults += 1;
    } else if (String(row.precio).trim() !== normalizedPrice) {
        row._normalizedFields.precio = true;
        counters.priceNormalized += 1;
    }
}

function applyActiveDefault(row, parsedHeaders, counters) {
    if (!parsedHeaders.includes('activo') || hasText(row.activo)) return;

    row._displayValues.activo = '1';
    row._importValues.activo = '1';
    row._defaultedFields.activo = true;
    counters.activeDefaults += 1;
}

function applyColorDefaults(row, parsedHeaders, counters) {
    COLOR_HEADERS.forEach((field) => {
        if (!parsedHeaders.includes(field) || !hasText(row[field])) return;
        const normalizedColor = normalizeHexColor(row[field]);
        if (!normalizedColor) return;

        row._displayValues[field] = normalizedColor;
        row._importValues[field] = normalizedColor;
        counters.colorValues += 1;
        if (String(row[field]).trim() !== normalizedColor) {
            row._normalizedFields[field] = true;
            counters.colorNormalized += 1;
        }
    });
}

function applyDisplayNameDefaults(row, parsedHeaders, fillProductDisplayNames, counters) {
    if (!parsedHeaders.includes('nombre_factura') && fillProductDisplayNames) {
        row._importValues.nombre_factura = row.nombre;
    }
    if (!parsedHeaders.includes('nombre_comanda') && fillProductDisplayNames) {
        row._importValues.nombre_comanda = row.nombre;
    }

    if (parsedHeaders.includes('nombre_factura') && !hasText(row.nombre_factura)) {
        if (fillProductDisplayNames) {
            row._displayValues.nombre_factura = row.nombre;
            row._importValues.nombre_factura = row.nombre;
            row._defaultedFields.nombre_factura = true;
            counters.facturaDefaults += 1;
        } else {
            counters.facturaBlanks += 1;
        }
    }

    if (parsedHeaders.includes('nombre_comanda') && !hasText(row.nombre_comanda)) {
        if (fillProductDisplayNames) {
            row._displayValues.nombre_comanda = row.nombre;
            row._importValues.nombre_comanda = row.nombre;
            row._defaultedFields.nombre_comanda = true;
            counters.comandaDefaults += 1;
        } else {
            counters.comandaBlanks += 1;
        }
    }
}

function pushDefaultWarnings(warnings, counters, fillProductDisplayNames) {
    if (counters.facturaDefaults > 0) {
        warnings.push(`${counters.facturaDefaults} filas sin nombre_factura usaran el nombre del producto. Puedes desactivar esta opcion si necesitas dejarlas en blanco.`);
    }
    if (counters.comandaDefaults > 0) {
        warnings.push(`${counters.comandaDefaults} filas sin nombre_comanda usaran el nombre del producto. Puedes desactivar esta opcion si necesitas dejarlas en blanco.`);
    }
    if (!fillProductDisplayNames && counters.facturaBlanks > 0) {
        warnings.push(`${counters.facturaBlanks} filas importaran nombre_factura en blanco porque la opcion de autocompletar esta desactivada.`);
    }
    if (!fillProductDisplayNames && counters.comandaBlanks > 0) {
        warnings.push(`${counters.comandaBlanks} filas importaran nombre_comanda en blanco porque la opcion de autocompletar esta desactivada.`);
    }
    if (counters.priceDefaults > 0) {
        warnings.push(`${counters.priceDefaults} filas sin precio se importaran con 0.00.`);
    }
    if (counters.priceNormalized > 0) {
        warnings.push(`${counters.priceNormalized} precios se normalizaran a formato de dos decimales antes de importar.`);
    }
    if (counters.activeDefaults > 0) {
        warnings.push(`${counters.activeDefaults} filas sin activo se importaran como activas (1/true).`);
    }
    if (counters.colorValues > 0) {
        warnings.push(`${counters.colorValues} valores de color se importaran desde el fichero. Si un color viene vacio, se mantiene el existente o se usa el color por defecto en productos nuevos.`);
    }
    if (counters.colorNormalized > 0) {
        warnings.push(`${counters.colorNormalized} colores se normalizaran a formato #rrggbb antes de importar.`);
    }
}
