export function showImportHelp(importType) {
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
}

export function hideImportHelp() {
    document.getElementById('modalImportHelp')?.classList.add('hidden');
}
