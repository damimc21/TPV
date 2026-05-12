import {
    COLOR_HEADERS,
    HEADERS_INVENTARIO,
    HEADERS_PRODUCTOS,
    formatDecimalValue,
    hasText,
    isColorHeader,
    normalizeHeader,
    normalizeHexColor,
    parseCsvText,
    parseDecimalValue,
} from './parsing.js';

/* ============================================================
   IMPORTAR PRODUCTOS / INVENTARIO - CSV y Excel
   ============================================================ */
(function () {
    let importType = 'productos';
    let parsedRows = [];
    let parsedHeaders = [];
    let validRows = [];
    let errors = [];
    let warnings = [];
    let verification = null;
    let fillProductDisplayNames = true;
    let hasBlockingErrors = false;

    function getCookie(name) {
        return window.TpvUtils ? window.TpvUtils.getCookie(name) : null;
    }

    function expectedHeaders() {
        return importType === 'productos' ? HEADERS_PRODUCTOS : HEADERS_INVENTARIO;
    }

    window.setImportType = (type) => {
        importType = type;
        document.getElementById('typeProductos').classList.toggle('active', type === 'productos');
        document.getElementById('typeInventario').classList.toggle('active', type === 'inventario');

        // Actualizar banner de contexto
        const uploadHint = document.getElementById('uploadHint');
        const dropZone = document.getElementById('dropZone');

        if (type === 'inventario') {
            if (uploadHint) uploadHint.innerHTML = 'Destino: <strong style="color: #34d399;">Artículos de Inventario</strong>';
            dropZone?.classList.add('fich-upload-zone--inventario');
            dropZone?.classList.remove('fich-upload-zone--productos');
        } else {
            if (uploadHint) uploadHint.innerHTML = 'Destino: <strong style="color: #60a5fa;">Productos (Catálogo)</strong>';
            dropZone?.classList.add('fich-upload-zone--productos');
            dropZone?.classList.remove('fich-upload-zone--inventario');
        }

        // Resetear fichero cargado al cambiar de tipo
        if (parsedRows.length > 0) {
            window.resetImport();
        }
    };

    window.setProductNameFallback = (checked) => {
        fillProductDisplayNames = Boolean(checked);
        refreshPreviewState();
        showPreview();
    };

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag-over');
        if (event.dataTransfer.files.length) {
            fileInput.files = event.dataTransfer.files;
            window.handleFileSelect(fileInput);
        }
    });

    window.handleFileSelect = async (input) => {
        const file = input.files[0];
        if (!file) return;
        document.getElementById('fileNameBadge').textContent = file.name;

        try {
            if (file.name.toLowerCase().endsWith('.xlsx')) {
                await parseUploadedFile(file);
            } else {
                const text = await readFileAsText(file);
                parseCSV(text);
            }
            applyPreviewDefaults();
            await verifyImportImpact();
            showPreview();
        } catch (e) {
            console.error(e);
            await Notify.error('No se pudo leer el fichero seleccionado.');
            input.value = '';
        }
    };

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file, 'UTF-8');
        });
    }

    async function parseUploadedFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tipo', importType);

        const resp = await fetch('/api/ficheros/importar-previsualizar/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            body: formData,
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'No se pudo previsualizar el fichero');

        parsedHeaders = (data.headers || []).map(normalizeHeader);
        parsedRows = (data.rows || []).map((row, index) => ({ ...row, _line: index + 2 }));
        validateRows();
    }

    function parseCSV(text) {
        const parsed = parseCsvText(text);
        parsedHeaders = parsed.headers;
        parsedRows = parsed.rows;
        errors = parsed.errors;
        validRows = [];
        if (errors.length > 0) {
            hasBlockingErrors = true;
            return;
        }
        validateRows();
    }

    function addRowError(row, message) {
        if (!row._errors) row._errors = [];
        if (!row._errors.includes(message)) {
            row._errors.push(message);
        }
        row._valid = false;
        row._error = row._errors.join(' | ');
    }

    function rowErrorList(row) {
        if (Array.isArray(row._errors) && row._errors.length > 0) return row._errors;
        return row._error ? [row._error] : [];
    }

    function addFileError(message, blocking = true) {
        if (!errors.includes(message)) {
            errors.push(message);
        }
        if (blocking) {
            hasBlockingErrors = true;
        }
    }

    function hasAnyHeader(headers) {
        return headers.some((header) => parsedHeaders.includes(header));
    }

    function validateRows() {
        errors = [];
        warnings = [];
        hasBlockingErrors = false;
        const expected = expectedHeaders();
        if (!parsedHeaders.includes('nombre')) {
            addFileError('Falta la columna obligatoria "nombre".');
        }

        if (importType === 'inventario' && parsedHeaders.includes('departamento')) {
            errors.push('Parece que has subido una plantilla de productos en la sección de inventario. Verifica el fichero.');
        }

        if (importType === 'productos' && (parsedHeaders.includes('categoria') || parsedHeaders.includes('stock_actual')) && !parsedHeaders.includes('departamento')) {
            errors.push('Parece que has subido una plantilla de inventario en la sección de productos. Verifica el fichero.');
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
            } else {
                ['stock_actual', 'stock_minimo', 'precio_compra'].forEach((field) => {
                    if (hasText(row[field]) && formatDecimalValue(row[field]) === null) {
                        addRowError(row, `${field} invalido.`);
                    }
                });
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

        validRows = hasBlockingErrors ? [] : parsedRows.filter((row) => row._valid);
    }

    function refreshPreviewState() {
        validateRows();
        applyPreviewDefaults();
        if (verification) {
            applyVerification();
            addVerificationWarnings();
        }
    }

    function applyPreviewDefaults() {
        parsedRows.forEach((row) => {
            row._displayValues = {};
            row._importValues = {};
            row._defaultedFields = {};
            row._normalizedFields = {};
        });

        if (importType !== 'productos') return;

        let facturaDefaults = 0;
        let comandaDefaults = 0;
        let facturaBlanks = 0;
        let comandaBlanks = 0;
        let priceDefaults = 0;
        let priceNormalized = 0;
        let activeDefaults = 0;
        let colorValues = 0;
        let colorNormalized = 0;

        parsedRows.forEach((row) => {
            if (!row._valid || !hasText(row.nombre)) return;

            if (parsedHeaders.includes('precio')) {
                const normalizedPrice = hasText(row.precio) ? formatDecimalValue(row.precio) : '0.00';
                if (normalizedPrice !== null) {
                    row._displayValues.precio = normalizedPrice;
                    row._importValues.precio = normalizedPrice;
                    if (!hasText(row.precio)) {
                        row._defaultedFields.precio = true;
                        priceDefaults += 1;
                    } else if (String(row.precio).trim() !== normalizedPrice) {
                        row._normalizedFields.precio = true;
                        priceNormalized += 1;
                    }
                }
            }

            if (parsedHeaders.includes('activo') && !hasText(row.activo)) {
                row._displayValues.activo = '1';
                row._importValues.activo = '1';
                row._defaultedFields.activo = true;
                activeDefaults += 1;
            }

            COLOR_HEADERS.forEach((field) => {
                if (!parsedHeaders.includes(field) || !hasText(row[field])) return;
                const normalizedColor = normalizeHexColor(row[field]);
                if (!normalizedColor) return;

                row._displayValues[field] = normalizedColor;
                row._importValues[field] = normalizedColor;
                colorValues += 1;
                if (String(row[field]).trim() !== normalizedColor) {
                    row._normalizedFields[field] = true;
                    colorNormalized += 1;
                }
            });

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
                    facturaDefaults += 1;
                } else {
                    facturaBlanks += 1;
                }
            }

            if (parsedHeaders.includes('nombre_comanda') && !hasText(row.nombre_comanda)) {
                if (fillProductDisplayNames) {
                    row._displayValues.nombre_comanda = row.nombre;
                    row._importValues.nombre_comanda = row.nombre;
                    row._defaultedFields.nombre_comanda = true;
                    comandaDefaults += 1;
                } else {
                    comandaBlanks += 1;
                }
            }
        });

        if (facturaDefaults > 0) {
            warnings.push(`${facturaDefaults} filas sin nombre_factura usaran el nombre del producto. Puedes desactivar esta opcion si necesitas dejarlas en blanco.`);
        }
        if (comandaDefaults > 0) {
            warnings.push(`${comandaDefaults} filas sin nombre_comanda usaran el nombre del producto. Puedes desactivar esta opcion si necesitas dejarlas en blanco.`);
        }
        if (!fillProductDisplayNames && facturaBlanks > 0) {
            warnings.push(`${facturaBlanks} filas importaran nombre_factura en blanco porque la opcion de autocompletar esta desactivada.`);
        }
        if (!fillProductDisplayNames && comandaBlanks > 0) {
            warnings.push(`${comandaBlanks} filas importaran nombre_comanda en blanco porque la opcion de autocompletar esta desactivada.`);
        }
        if (priceDefaults > 0) {
            warnings.push(`${priceDefaults} filas sin precio se importaran con 0.00.`);
        }
        if (priceNormalized > 0) {
            warnings.push(`${priceNormalized} precios se normalizaran a formato de dos decimales antes de importar.`);
        }
        if (activeDefaults > 0) {
            warnings.push(`${activeDefaults} filas sin activo se importaran como activas (1/true).`);
        }
        if (colorValues > 0) {
            warnings.push(`${colorValues} valores de color se importaran desde el fichero. Si un color viene vacio, se mantiene el existente o se usa el color por defecto en productos nuevos.`);
        }
        if (colorNormalized > 0) {
            warnings.push(`${colorNormalized} colores se normalizaran a formato #rrggbb antes de importar.`);
        }
    }

    async function verifyImportImpact() {
        verification = null;
        parsedRows.forEach((row) => {
            row._impact = '';
            row._impactLabel = '';
            row._impactClass = '';
            row._notes = [];
        });

        if (parsedRows.length === 0 || hasBlockingErrors) return;

        try {
            const resp = await fetch('/api/ficheros/importar-verificar/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify({
                    tipo: importType,
                    rows: parsedRows.map(cleanRowForVerification),
                }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'No se pudo verificar el fichero');

            verification = data;
            applyVerification();
            addVerificationWarnings();
        } catch (err) {
            console.error(err);
            warnings.push('No se pudo verificar contra la base de datos. Revisa manualmente antes de importar.');
        }
    }

    function cleanRowForVerification(row) {
        const clean = {};
        Object.keys(row).forEach((key) => {
            if (!key.startsWith('_') || key === '_line') {
                clean[key] = row[key];
            }
        });
        return clean;
    }

    function cleanRowForImport(row) {
        const clean = {};
        Object.keys(row).forEach((key) => {
            if (!key.startsWith('_')) {
                clean[key] = row[key];
            }
        });
        Object.assign(clean, row._importValues || {});
        return clean;
    }

    function applyVerification() {
        const verified = new Map((verification?.rows || []).map((row) => [Number(row.line), row]));
        parsedRows.forEach((row) => {
            const meta = verified.get(Number(row._line));
            if (!meta) return;

            row._impact = meta.action || '';
            row._impactLabel = meta.action_label || '';
            row._impactClass = meta.impact_class || meta.action || '';
            row._notes = Array.isArray(meta.notes) ? meta.notes : [];

            if (meta.action === 'duplicate') {
                addRowError(row, row._notes[0] || 'Revisar antes de importar.');
            } else if (meta.action === 'error' && (!row._errors || row._errors.length === 0)) {
                addRowError(row, row._notes[0] || 'Revisar antes de importar.');
            }
        });
        validRows = parsedRows.filter((row) => row._valid);
    }

    function addVerificationWarnings() {
        const summary = verification?.summary || {};
        if (summary.duplicados_archivo > 0) {
            warnings.push(`${summary.duplicados_archivo} filas tienen nombres duplicados dentro del fichero y no se importaran hasta corregirlas.`);
        }
        if (summary.eliminados_existentes > 0) {
            warnings.push(`${summary.eliminados_existentes} productos coinciden con productos eliminados: se actualizaran, pero seguiran eliminados en Catalogo.`);
        }
        if (summary.grupos_nuevos > 0) {
            const names = formatNameSample(summary.grupos_nuevos_lista || [], summary.grupos_nuevos);
            const isSingleGroup = summary.grupos_nuevos === 1;
            const groupLabel = isSingleGroup
                ? (summary.grupo_singular || 'grupo')
                : (summary.grupo_tipo || 'grupos');
            const groupVerb = isSingleGroup ? 'no existe todavia' : 'no existen todavia';
            const creationHint = isSingleGroup
                ? 'Se creara automaticamente al importar una fila valida que lo use.'
                : 'Se crearan automaticamente al importar filas validas que los usen.';
            warnings.push(`${summary.grupos_nuevos} ${groupLabel} ${groupVerb}${names ? `: ${names}.` : '.'} ${creationHint}`);
        }
        if (summary.unidades_corregidas > 0) {
            warnings.push(`${summary.unidades_corregidas} unidades de inventario no se reconocen y se importaran como ud.`);
        }
        if (summary.proveedores_nuevos > 0) {
            const names = formatNameSample(summary.proveedores_nuevos_lista || [], summary.proveedores_nuevos);
            const verb = summary.proveedores_nuevos === 1 ? 'no existe todavia' : 'no existen todavia';
            const hint = summary.proveedores_nuevos === 1
                ? 'Se creara automaticamente al importar una fila valida que lo use.'
                : 'Se crearan automaticamente al importar filas validas que los usen.';
            warnings.push(`${summary.proveedores_nuevos} proveedores ${verb}${names ? `: ${names}.` : '.'} ${hint}`);
        }
    }

    function formatNameSample(names, total) {
        if (!Array.isArray(names) || names.length === 0) return '';
        const shown = names.slice(0, 5).join(', ');
        return total > names.length ? `${shown}...` : shown;
    }

    function renderImpactSummary() {
        const impactEl = document.getElementById('previewImpact');
        if (!impactEl) return;

        const summary = verification?.summary;
        if (!summary) {
            impactEl.classList.add('hidden');
            impactEl.innerHTML = '';
            return;
        }

        const groupLabel = summary.grupo_tipo || (importType === 'productos' ? 'departamentos' : 'categorias');
        const groupNames = formatNameSample(summary.grupos_nuevos_lista || [], summary.grupos_nuevos);
        impactEl.classList.remove('hidden');
        impactEl.innerHTML = `
            <div class="fich-impact-tile fich-impact-tile--create">
                <span>Crear</span>
                <strong>${summary.crear || 0}</strong>
                <small>Nuevos ${escHtml(summary.entidad_plural || 'registros')}</small>
            </div>
            <div class="fich-impact-tile fich-impact-tile--update">
                <span>Actualizar</span>
                <strong>${summary.actualizar || 0}</strong>
                <small>Coinciden por nombre</small>
            </div>
            <div class="fich-impact-tile fich-impact-tile--review">
                <span>Revisar</span>
                <strong>${summary.revisar || 0}</strong>
                <small>Duplicados o casos sensibles</small>
            </div>
            <div class="fich-impact-tile fich-impact-tile--group">
                <span>${escHtml(groupLabel)}</span>
                <strong>${summary.grupos_nuevos || 0}</strong>
                <small title="${escHtml(groupNames)}">${groupNames ? escHtml(groupNames) : 'Sin nuevos'}</small>
            </div>
        `;
    }

    function renderImportOptions() {
        const optionsEl = document.getElementById('productImportOptions');
        const checkbox = document.getElementById('fillProductNamesOption');
        if (!optionsEl || !checkbox) return;

        const showOptions = importType === 'productos' && parsedRows.length > 0;
        optionsEl.classList.toggle('hidden', !showOptions);
        checkbox.checked = fillProductDisplayNames;
    }

    function displayValue(row, header) {
        if (Object.prototype.hasOwnProperty.call(row._displayValues || {}, header)) {
            return row._displayValues[header];
        }
        return row[header];
    }

    function buildPreviewCell(row, header) {
        const value = displayValue(row, header);
        const classes = [];
        let title = value;
        const normalizedColor = isColorHeader(header) ? normalizeHexColor(value) : null;
        if (row._defaultedFields?.[header]) {
            classes.push('cell-defaulted');
            title = `${value} - valor automatico`;
        } else if (row._normalizedFields?.[header]) {
            classes.push('cell-normalized');
            title = `${value} - valor normalizado`;
        }
        if (normalizedColor) {
            classes.push('cell-color');
            return `<td class="${classes.join(' ')}" title="${escHtml(title)}">
                <span class="fich-color-cell">
                    <span class="fich-color-swatch" style="--fich-import-color:${escHtml(normalizedColor)}"></span>
                    <span>${escHtml(normalizedColor)}</span>
                </span>
            </td>`;
        }
        return `<td class="${classes.join(' ')}" title="${escHtml(title)}">${escHtml(value)}</td>`;
    }

    function buildRowStatus(row) {
        const rowErrors = rowErrorList(row);
        const notes = (row._notes || []).join(' - ');
        const title = [...rowErrors, notes].filter(Boolean).join(' - ');
        if (!row._valid) {
            const errorLabel = row._impact === 'duplicate' ? (row._impactLabel || 'Duplicado') : 'Error';
            const detail = rowErrors.length > 0
                ? rowErrors.map((error) => `<small>${escHtml(error)}</small>`).join('')
                : `<small>${escHtml(title || 'Error')}</small>`;
            return `<td class="fich-impact-cell" title="${escHtml(title)}">
                <span class="fich-impact-badge fich-impact-badge--error">${escHtml(errorLabel)}</span>
                ${detail}
            </td>`;
        }

        const impactClass = safeClassName(row._impactClass || 'ok');
        return `<td class="fich-impact-cell" title="${escHtml(title)}">
            <span class="fich-impact-badge fich-impact-badge--${impactClass}">${escHtml(row._impactLabel || 'OK')}</span>
            ${notes ? `<small>${escHtml(notes)}</small>` : ''}
        </td>`;
    }

    function safeClassName(value) {
        return String(value || '').replace(/[^a-z0-9_-]/gi, '') || 'ok';
    }

    function showPreview() {
        document.getElementById('stepUpload').classList.add('hidden');
        document.getElementById('stepPreview').classList.remove('hidden');

        const statsEl = document.getElementById('previewStats');
        statsEl.innerHTML = `
            <span class="fich-stat-pill fich-stat-pill--ok">${validRows.length} validos</span>
            <span class="fich-stat-pill">${parsedRows.length} total</span>
            ${warnings.length > 0 ? `<span class="fich-stat-pill fich-stat-pill--warn">${warnings.length} avisos</span>` : ''}
            ${parsedRows.length - validRows.length > 0 ? `<span class="fich-stat-pill fich-stat-pill--err">${parsedRows.length - validRows.length} con errores</span>` : ''}
        `;
        renderImpactSummary();
        renderImportOptions();

        const guidance = document.getElementById('previewWarnings');
        const warningList = document.getElementById('warningList');
        if (guidance && warningList) {
            if (warnings.length > 0) {
                guidance.classList.remove('hidden');
                warningList.innerHTML = warnings.map((warning) => `<li>${escHtml(warning)}</li>`).join('');
            } else {
                guidance.classList.add('hidden');
                warningList.innerHTML = '';
            }
        }

        const thead = document.getElementById('previewHead');
        thead.innerHTML = '<tr>' + parsedHeaders.map((h) => `<th>${escHtml(h)}</th>`).join('') + '<th>Accion</th></tr>';

        const tbody = document.getElementById('previewBody');
        tbody.innerHTML = parsedRows.slice(0, 100).map((row) => {
            const cls = row._valid ? '' : 'row-err';
            const cells = parsedHeaders.map((h) => buildPreviewCell(row, h)).join('');
            const status = buildRowStatus(row);
            return `<tr class="${cls}">${cells}${status}</tr>`;
        }).join('');

        if (parsedRows.length > 100) {
            tbody.innerHTML += `<tr><td colspan="${parsedHeaders.length + 1}" class="fich-empty-cell">... y ${parsedRows.length - 100} filas mas</td></tr>`;
        }

        const errBox = document.getElementById('previewErrors');
        const errList = document.getElementById('errorList');
        const rowErrors = parsedRows.filter((row) => !row._valid);
        if (rowErrors.length > 0 || errors.length > 0) {
            errBox.classList.remove('hidden');
            const errorItems = errors.map((error) => `<li>${escHtml(error)}</li>`);
            rowErrors.slice(0, 10).forEach((row) => {
                errorItems.push(`<li>Fila ${row._line}: ${escHtml(rowErrorList(row).join(' - ') || 'Error desconocido')}</li>`);
            });
            if (rowErrors.length > 10) {
                errorItems.push(`<li>... y ${rowErrors.length - 10} filas mas con errores o revisiones.</li>`);
            }
            errList.innerHTML = errorItems.join('');
        } else {
            errBox.classList.add('hidden');
        }

        const confirmBtn = document.getElementById('btnConfirmImport');
        confirmBtn.innerHTML = `Importar <span id="importCount">${validRows.length}</span> registros`;
        confirmBtn.disabled = validRows.length === 0;
    }

    window.resetImport = () => {
        document.getElementById('stepUpload').classList.remove('hidden');
        document.getElementById('stepPreview').classList.add('hidden');
        document.getElementById('stepResult').classList.add('hidden');
        document.getElementById('csvFileInput').value = '';
        parsedRows = [];
        parsedHeaders = [];
        validRows = [];
        errors = [];
        warnings = [];
        verification = null;
        fillProductDisplayNames = true;
        hasBlockingErrors = false;
    };

    window.mostrarAyudaImportacion = () => {
        const modal = document.getElementById('modalImportHelp');
        const helpProductos = document.getElementById('helpProductos');
        const helpInventario = document.getElementById('helpInventario');
        const title = document.getElementById('helpModalTitle');
        if (importType === 'inventario') {
            helpProductos?.classList.add('hidden');
            helpInventario?.classList.remove('hidden');
            if (title) title.textContent = 'Formato de importacion - Inventario';
        } else {
            helpProductos?.classList.remove('hidden');
            helpInventario?.classList.add('hidden');
            if (title) title.textContent = 'Formato de importacion - Productos';
        }
        modal?.classList.remove('hidden');
    };

    window.cerrarAyudaImportacion = () => {
        document.getElementById('modalImportHelp')?.classList.add('hidden');
    };

    window.confirmarImportacion = async () => {
        const btn = document.getElementById('btnConfirmImport');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        const endpoint = importType === 'productos'
            ? '/api/ficheros/importar-productos/'
            : '/api/ficheros/importar-inventario/';

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify({
                    rows: validRows.map(cleanRowForImport),
                    opciones: {
                        rellenar_nombres_producto: fillProductDisplayNames,
                    },
                }),
            });

            const data = await resp.json();

            document.getElementById('stepPreview').classList.add('hidden');
            document.getElementById('stepResult').classList.remove('hidden');

            if (resp.ok) {
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
        } catch (err) {
            console.error(err);
            document.getElementById('stepPreview').classList.add('hidden');
            document.getElementById('stepResult').classList.remove('hidden');
            document.getElementById('resultSummary').innerHTML = `
                <div class="fich-result-icon">ERROR</div>
                <h3 class="fich-result-title">Error de conexion</h3>
                <p class="fich-result-detail">No se pudo contactar con el servidor.</p>
            `;
        }
    };

    window.descargarPlantillaFormato = (event, formato) => {
        event.stopPropagation();
        window.location.href = `/api/ficheros/importar-plantilla/?tipo=${encodeURIComponent(importType)}&format=${encodeURIComponent(formato)}`;
    };

    window.descargarPlantilla = () => {
        window.location.href = `/api/ficheros/importar-plantilla/?tipo=${encodeURIComponent(importType)}&format=csv`;
    };

    function escHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
