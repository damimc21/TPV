import { formatNameSample } from './render_utils.js';
import { addRowError } from './validation.js';

const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

export function resetRowImpact(parsedRows) {
    parsedRows.forEach((row) => {
        row._impact = '';
        row._impactLabel = '';
        row._impactClass = '';
        row._notes = [];
    });
}

export function cleanRowForVerification(row) {
    const clean = {};
    Object.keys(row).forEach((key) => {
        if (!key.startsWith('_') || key === '_line') {
            clean[key] = row[key];
        }
    });
    return clean;
}

export function applyVerification(parsedRows, verification) {
    const verified = new Map((verification?.rows || []).map((row) => [Number(row.line), row]));
    parsedRows.forEach((row) => {
        const meta = verified.get(Number(row._line));
        if (!meta) return;

        row._impact = meta.action || '';
        row._impactLabel = meta.action_label || '';
        row._impactClass = meta.impact_class || meta.action || '';
        row._notes = Array.isArray(meta.notes) ? meta.notes : [];

        if (meta.action === 'duplicate') {
            addRowError(row, row._notes[0] || gettext('Revisar antes de importar.'));
        } else if (meta.action === 'error' && (!row._errors || row._errors.length === 0)) {
            addRowError(row, row._notes[0] || gettext('Revisar antes de importar.'));
        }
    });
    return parsedRows.filter((row) => row._valid);
}

export function addVerificationWarnings(warnings, verification) {
    const summary = verification?.summary || {};
    if (summary.duplicados_archivo > 0) {
        warnings.push(`${summary.duplicados_archivo} ${gettext('filas tienen nombres duplicados dentro del fichero y no se importarán hasta corregirlas.')}`);
    }
    if (summary.eliminados_existentes > 0) {
        warnings.push(`${summary.eliminados_existentes} ${gettext('productos coinciden con productos eliminados. Se actualizarán, pero seguirán eliminados en Catálogo.')}`);
    }
    if (summary.grupos_nuevos > 0) {
        const names = formatNameSample(summary.grupos_nuevos_lista || [], summary.grupos_nuevos);
        const isSingleGroup = summary.grupos_nuevos === 1;
        const groupLabel = isSingleGroup
            ? gettext(summary.grupo_singular || 'grupo')
            : gettext(summary.grupo_tipo || 'grupos');
        const groupVerb = isSingleGroup ? gettext('no existe todavía') : gettext('no existen todavía');
        const creationHint = isSingleGroup
            ? gettext('Se creará automáticamente al importar una fila válida que lo use.')
            : gettext('Se crearán automáticamente al importar filas válidas que los usen.');
        warnings.push(`${summary.grupos_nuevos} ${groupLabel} ${groupVerb}${names ? `: ${names}.` : '.'} ${creationHint}`);
    }
    if (summary.unidades_corregidas > 0) {
        warnings.push(`${summary.unidades_corregidas} ${gettext('unidades de inventario no se reconocen y se importarán como ud.')}`);
    }
    if (summary.proveedores_nuevos > 0) {
        const names = formatNameSample(summary.proveedores_nuevos_lista || [], summary.proveedores_nuevos);
        const verb = summary.proveedores_nuevos === 1 ? gettext('no existe todavía') : gettext('no existen todavía');
        const hint = summary.proveedores_nuevos === 1
            ? gettext('Se creará automáticamente al importar una fila válida que lo use.')
            : gettext('Se crearán automáticamente al importar filas válidas que los usen.');
        warnings.push(`${summary.proveedores_nuevos} ${gettext('proveedores')} ${verb}${names ? `: ${names}.` : '.'} ${hint}`);
    }
    return warnings;
}
