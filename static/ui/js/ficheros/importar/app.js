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
import { renderPreview } from './preview.js';
import {
    applyProductPreviewDefaults,
    validateImportRows,
} from './validation.js';
import { showConnectionError, showImportResult } from './result.js';
import { hideImportHelp, showImportHelp } from './help_modal.js';
import {
    addVerificationWarnings as addVerificationWarningsToList,
    applyVerification as applyVerificationToRows,
    cleanRowForVerification,
    resetRowImpact,
} from './verification.js';

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
        resetRowImpact(parsedRows);

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
        validRows = applyVerificationToRows(parsedRows, verification);
    }

    function addVerificationWarnings() {
        warnings = addVerificationWarningsToList(warnings, verification);
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
        showImportHelp(importType);
    };

    window.cerrarAyudaImportacion = () => {
        hideImportHelp();
    };

    window.confirmarImportacion = async () => {
        const btn = document.getElementById('btnConfirmImport');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            const result = await importRows(importType, validRows.map(cleanRowForImport), {
                rellenar_nombres_producto: fillProductDisplayNames,
            });
            showImportResult(result);
        } catch (err) {
            console.error(err);
            showConnectionError();
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
