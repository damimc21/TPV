/* ============================================================
   EXPORTAR DATOS — Lógica JS
   ============================================================ */
(function () {

    // Cargar departamentos al inicio
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const resp = await fetch('/api/departamentos/');
            if (resp.ok) {
                const deptos = await resp.json();
                const sel = document.getElementById('expProdDepto');
                deptos.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.nombre;
                    sel.appendChild(opt);
                });
            }
        } catch (e) { console.error(e); }
    });

    window.exportarProductos = () => {
        const activos = document.getElementById('expProdActivos').checked;
        const eliminados = document.getElementById('expProdEliminados').checked;
        const depto = document.getElementById('expProdDepto').value;

        let url = '/api/ficheros/exportar-productos/?format=csv';
        if (activos) url += '&activos=1';
        if (eliminados) url += '&eliminados=1';
        if (depto) url += '&departamento=' + depto;

        window.location.href = url;
    };

    window.exportarInventario = () => {
        window.location.href = '/api/ficheros/exportar-inventario/?format=csv';
    };

})();
