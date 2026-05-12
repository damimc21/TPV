import {
    normalizeHeader,
    parseCsvText,
} from './parsing.js';
import {
    buildTemplateUrl,
    importRows,
    previewUploadedFile,
    verifyImportRows,
} from './api.js';
import {
    escHtml,
    formatNameSample,
} from './render_utils.js';
import { renderPreview } from './preview.js';
import {
    addRowError,
    applyProductPreviewDefaults,
    rowErrorList,
    validateImportRows,
} from './validation.js';

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
        const data = await previewUploadedFile(file, importType);
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

    function validateRows() {
        const result = validateImportRows({ importType, parsedHeaders, parsedRows });
        errors = result.errors;
        warnings = result.warnings;
        hasBlockingErrors = result.hasBlockingErrors;
        validRows = result.validRows;
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
        warnings = applyProductPreviewDefaults({
            importType,
            parsedHeaders,
            parsedRows,
            warnings,
            fillProductDisplayNames,
        });
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
            verification = await verifyImportRows(importType, parsedRows.map(cleanRowForVerification));
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

    function showPreview() {
        renderPreview({
            importType,
            parsedHeaders,
            parsedRows,
            validRows,
            warnings,
            errors,
            verification,
            fillProductDisplayNames,
        });
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

        try {
            const result = await importRows(importType, validRows.map(cleanRowForImport), {
                rellenar_nombres_producto: fillProductDisplayNames,
            });
            const data = result.data;

            document.getElementById('stepPreview').classList.add('hidden');
            document.getElementById('stepResult').classList.remove('hidden');

            if (result.ok) {
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
        window.location.href = buildTemplateUrl(importType, formato);
    };

    window.descargarPlantilla = () => {
        window.location.href = buildTemplateUrl(importType, 'csv');
    };

})();
