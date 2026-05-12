import { isColorHeader, normalizeHexColor } from './parsing.js';
import { escHtml, formatNameSample, safeClassName } from './render_utils.js';
import { rowErrorList } from './validation.js';

export function renderPreview({
    importType,
    parsedHeaders,
    parsedRows,
    validRows,
    warnings,
    errors,
    verification,
    fillProductDisplayNames,
}) {
    document.getElementById('stepUpload').classList.add('hidden');
    document.getElementById('stepPreview').classList.remove('hidden');

    renderStats(parsedRows, validRows, warnings);
    renderImpactSummary(importType, verification);
    renderImportOptions(importType, parsedRows, fillProductDisplayNames);
    renderWarnings(warnings);
    renderPreviewTable(parsedHeaders, parsedRows);
    renderPreviewErrors(parsedRows, errors);
    renderConfirmButton(validRows);
}

function renderStats(parsedRows, validRows, warnings) {
    const statsEl = document.getElementById('previewStats');
    statsEl.innerHTML = `
        <span class="fich-stat-pill fich-stat-pill--ok">${validRows.length} validos</span>
        <span class="fich-stat-pill">${parsedRows.length} total</span>
        ${warnings.length > 0 ? `<span class="fich-stat-pill fich-stat-pill--warn">${warnings.length} avisos</span>` : ''}
        ${parsedRows.length - validRows.length > 0 ? `<span class="fich-stat-pill fich-stat-pill--err">${parsedRows.length - validRows.length} con errores</span>` : ''}
    `;
}

function renderImpactSummary(importType, verification) {
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

function renderImportOptions(importType, parsedRows, fillProductDisplayNames) {
    const optionsEl = document.getElementById('productImportOptions');
    const checkbox = document.getElementById('fillProductNamesOption');
    if (!optionsEl || !checkbox) return;

    const showOptions = importType === 'productos' && parsedRows.length > 0;
    optionsEl.classList.toggle('hidden', !showOptions);
    checkbox.checked = fillProductDisplayNames;
}

function renderWarnings(warnings) {
    const guidance = document.getElementById('previewWarnings');
    const warningList = document.getElementById('warningList');
    if (!guidance || !warningList) return;

    if (warnings.length > 0) {
        guidance.classList.remove('hidden');
        warningList.innerHTML = warnings.map((warning) => `<li>${escHtml(warning)}</li>`).join('');
    } else {
        guidance.classList.add('hidden');
        warningList.innerHTML = '';
    }
}

function renderPreviewTable(parsedHeaders, parsedRows) {
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
}

function renderPreviewErrors(parsedRows, errors) {
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
}

function renderConfirmButton(validRows) {
    const confirmBtn = document.getElementById('btnConfirmImport');
    confirmBtn.innerHTML = `Importar <span id="importCount">${validRows.length}</span> registros`;
    confirmBtn.disabled = validRows.length === 0;
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
