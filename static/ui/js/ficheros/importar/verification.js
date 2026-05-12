import { formatNameSample } from './render_utils.js';
import { addRowError } from './validation.js';

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
            addRowError(row, row._notes[0] || 'Revisar antes de importar.');
        } else if (meta.action === 'error' && (!row._errors || row._errors.length === 0)) {
            addRowError(row, row._notes[0] || 'Revisar antes de importar.');
        }
    });
    return parsedRows.filter((row) => row._valid);
}

export function addVerificationWarnings(warnings, verification) {
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
    return warnings;
}
