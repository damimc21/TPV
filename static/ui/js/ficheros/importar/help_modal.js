const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

export function showImportHelp(importType) {
    const modal = document.getElementById('modalImportHelp');
    const helpProductos = document.getElementById('helpProductos');
    const helpInventario = document.getElementById('helpInventario');
    const title = document.getElementById('helpModalTitle');
    if (importType === 'inventario') {
        helpProductos?.classList.add('hidden');
        helpInventario?.classList.remove('hidden');
        if (title) title.textContent = gettext('Formato de importación - Inventario');
    } else {
        helpProductos?.classList.remove('hidden');
        helpInventario?.classList.add('hidden');
        if (title) title.textContent = gettext('Formato de importación - Productos');
    }
    modal?.classList.remove('hidden');
}

export function hideImportHelp() {
    document.getElementById('modalImportHelp')?.classList.add('hidden');
}
