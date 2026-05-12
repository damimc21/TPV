export function initProductUI() {
    const prodNombre = document.getElementById('prod_nombre');
    const prodFactura = document.getElementById('prod_nombre_factura');
    const prodComanda = document.getElementById('prod_nombre_comanda');
    const prodPrecio = document.getElementById('prod_precio');

    if (!prodNombre) return;

    prodNombre.addEventListener('blur', () => {
        const val = prodNombre.value.trim();
        if (val) {
            if (prodFactura && !prodFactura.value.trim()) prodFactura.value = val;
            if (prodComanda && !prodComanda.value.trim()) prodComanda.value = val;
        }
    });

    if (prodPrecio) {
        prodPrecio.addEventListener('blur', () => {
            let val = prodPrecio.value.trim().replace(',', '.');
            if (val && !Number.isNaN(parseFloat(val))) {
                prodPrecio.value = parseFloat(val).toFixed(2);
            }
        });
    }
}
