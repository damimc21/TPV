import { initCatalogoExtras } from './extras.js';
import {
    deleteDepartamentoApi,
    deleteProductoApi,
    fetchDepartamentos,
    fetchImpresoras,
    fetchProductos,
    saveDepartamentoApi,
    saveProductoApi,
} from './api.js';
import { escapeHtml, getCookie } from './utils.js';
import {
    renderDepartamentosTable,
    renderProductosTable,
    updateDepartmentSelects,
    updateImpresoraSelect,
} from './tables.js';
import {
    applySorting,
    getFilterState,
    initCatalogoFilters,
    syncFilterState,
} from './filters.js';
import { initProductUI } from './product_ui.js';
import {
    initColorPickers,
    resetColor as resetPickerColor,
    syncSwatches,
} from './color_pickers.js';

/* ============================================================
   GESTIÓN DEL CATÁLOGO TPV (SPA)
   Este archivo maneja la lógica de la vista única para
   administrar Departamentos y Productos.
   ============================================================ */

function initCatalogoApp() {
    'use strict';

    // Referencias a elementos de la interfaz
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');
    const btnNuevo = document.getElementById('btnNuevo');

    // Estado de la aplicación y Filtros
    let hash = window.location.hash ? window.location.hash.substring(1) : '';
    let activeTab = (hash === 'departamentos' || hash === 'productos') ? hash : 'departamentos';

    // Caché local de datos
    let departamentosData = [];
    let productosData = [];
    let impresorasData = [];
    let isInitialLoadDepto = true;
    let isInitialLoadProd = true;
    const t = window.t || ((key, fallback) => fallback || key);
    let updateLivePreview = () => { };

    // ==========================================
    // 1. INICIALIZACIÓN
    // ==========================================
    function init() {
        initTabs();
        initModals();
        initProductUI();
        initFilters();

        // Carga inicial de datos desde las APIs
        loadDepartamentos();
        loadProductos();
        loadImpresoras();
    }

    // ==========================================
    // 2. SISTEMA DE PESTAÑAS (TABS)
    // ==========================================
    function initTabs() {
        if (activeTab !== 'departamentos' && activeTab !== 'productos') {
            activeTab = 'departamentos';
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-tab');
                if (activeTab === targetId) return;
                activateTab(targetId);
            });
        });

        activateTab(activeTab, true);
    }

    function activateTab(targetId, skipAnimation = false) {
        // 1. Set tab button states
        tabBtns.forEach(b => {
            if (skipAnimation) b.style.transition = 'none';
            if (b.getAttribute('data-tab') === targetId) {
                b.classList.add('is-active');
            } else {
                b.classList.remove('is-active');
            }
            if (skipAnimation) {
                b.offsetHeight;
                b.style.transition = '';
            }
        });

        // 2. Set view visibility
        tabViews.forEach(v => {
            if (v.id === `view-${targetId}`) {
                v.classList.remove('hidden');
                v.classList.add('is-active');
            } else {
                v.classList.remove('is-active');
                v.classList.add('hidden');
            }
        });

        activeTab = targetId;
        window.history.replaceState(null, null, `#${targetId}`);

        // 3. Update button text
        btnNuevo.innerHTML = activeTab === 'departamentos'
            ? `<img src="/static/ui/img/iconos/plus.svg" alt=""> ${t('catalogo.newDepartment', 'Nuevo Departamento')}`
            : `<img src="/static/ui/img/iconos/plus.svg" alt=""> ${t('catalogo.newProduct', 'Nuevo Producto')}`;

        // 4. Update filter visibility
        if (activeTab === 'departamentos') {
            document.getElementById('filterDeptoContainer')?.classList.add('hidden');
            renderDepartamentos();
        } else {
            document.getElementById('filterDeptoContainer')?.classList.remove('hidden');
            renderProductos();
        }

        // 5. Reveal UI (only needed on first load)
        if (skipAnimation) {
            const app = document.querySelector('.catalogo-app');
            if (app) app.classList.remove('is-resolving');
        }
    }

    // ==========================================
    // 3. SISTEMA DE FILTROS Y ORDENACIÓN
    // ==========================================
    function initFilters() {
        initCatalogoFilters({
            t,
            getActiveTab: () => activeTab,
            renderActiveTab: (tab) => {
                if (tab === 'departamentos') renderDepartamentos();
                else renderProductos();
            },
        });
        return;

        const searchInput = document.getElementById('searchInput');
        const sortFieldEl = document.getElementById('sortField');
        const sortDirBtn = document.getElementById('sortDirBtn');
        initCustomSelect('customFilterDepto', onFilterChange);
        initCustomSelect('customSortField', onFilterChange);

        function onFilterChange() {
            syncFilterState();
            if (activeTab === 'departamentos') renderDepartamentos();
            else renderProductos();
        }

        searchInput.addEventListener('input', onFilterChange);

        // Popover de Filtros
        const btnToggleFilters = document.getElementById('btnToggleFilters');
        const filterPopover = document.getElementById('filterPopover');
        const btnClearFilters = document.getElementById('btnClearFilters');

        if (btnToggleFilters && filterPopover) {
            btnToggleFilters.addEventListener('click', (e) => {
                e.stopPropagation();
                filterPopover.classList.toggle('is-active');
                // Al abrir/cerrar popover, cerramos los selects internos si estuvieran abiertos
                document.querySelectorAll('.custom-select').forEach(cs => cs.classList.remove('is-active'));
            });

            // Cerrar al pulsar "Listo"
            document.getElementById('btnApplyFilters')?.addEventListener('click', () => {
                filterPopover.classList.remove('is-active');
            });

            document.addEventListener('click', (e) => {
                if (!filterPopover.contains(e.target) && !btnToggleFilters.contains(e.target)) {
                    filterPopover.classList.remove('is-active');
                }
                // También cerrar cualquier custom select al pinchar fuera
                if (!e.target.closest('.custom-select')) {
                    document.querySelectorAll('.custom-select').forEach(cs => cs.classList.remove('is-active'));
                }
            });

            filterPopover.addEventListener('click', (e) => e.stopPropagation());
        }

        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => {
                searchInput.value = '';
                setCustomSelectValue('customFilterDepto', '', t('catalogo.allDepartments', '-- Todos los Deptos --'));
                setCustomSelectValue('customSortField', 'id', t('catalogo.sort.id', 'ID'));
                sortDir = 'asc';
                updateSortDirUI();
                onFilterChange();
                filterPopover.classList.remove('is-active');
            });
        }

        updateSortDirUI();

        sortDirBtn.addEventListener('click', () => {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            updateSortDirUI();
            onFilterChange();
        });

        function updateSortDirUI() {
            sortDirBtn.className = 'btn-sort-option';
            sortDirBtn.innerHTML = sortDir === 'asc'
                ? `<img src="/static/ui/img/iconos/move-up.svg" alt=""> <span id="sortDirText">${t('common.sortAsc', 'Ascendente')}</span>`
                : `<img src="/static/ui/img/iconos/move-down.svg" alt=""> <span id="sortDirText">${t('common.sortDesc', 'Descendente')}</span>`;
            sortDirBtn.title = sortDir === 'asc' ? t('common.sortAsc', 'Ascendente') : t('common.sortDesc', 'Descendente');
        }
    }

    function syncFilterStateLegacy() {
        searchString = (document.getElementById('searchInput')?.value || '').toLowerCase();
        sortField = getCustomSelectValue('customSortField') || 'id';
        deptoFilterId = getCustomSelectValue('customFilterDepto') || '';
    }

    function applySortingLegacy(array) {
        const dir = sortDir === 'asc' ? 1 : -1;
        return array.sort((a, b) => {
            if (sortField === 'id') return (a.id - b.id) * dir;
            if (sortField === 'nombre') {
                return (a.nombre || '').localeCompare(b.nombre || '') * dir;
            }
            if (sortField === 'precio') {
                return (parseFloat(a.precio || 0) - parseFloat(b.precio || 0)) * dir;
            }
            if (sortField === 'activo') {
                return ((a.activo === b.activo) ? 0 : a.activo ? -1 : 1) * dir;
            }
            return 0;
        });
    }

    // ==========================================
    // 4. LÓGICA DE UI ESPECÍFICA (PRODUCTOS)
    // ==========================================
    function initProductUILegacy() {
        const prodNombre = document.getElementById('prod_nombre');
        const prodFactura = document.getElementById('prod_nombre_factura');
        const prodComanda = document.getElementById('prod_nombre_comanda');
        const prodPrecio = document.getElementById('prod_precio');

        if (!prodNombre) return;

        // Autocompletar descripciones si están vacías
        prodNombre.addEventListener('blur', () => {
            const val = prodNombre.value.trim();
            if (val) {
                if (prodFactura && !prodFactura.value.trim()) prodFactura.value = val;
                if (prodComanda && !prodComanda.value.trim()) prodComanda.value = val;
            }
        });

        // Formatear precio a 2 decimales
        if (prodPrecio) {
            prodPrecio.addEventListener('blur', () => {
                let val = prodPrecio.value.trim().replace(',', '.');
                if (val && !isNaN(parseFloat(val))) {
                    prodPrecio.value = parseFloat(val).toFixed(2);
                }
            });
        }
    }

    // ==========================================
    // 5. SISTEMA DE MODALES
    // ==========================================
    function initModals() {
        if (btnNuevo) {
            btnNuevo.addEventListener('click', () => {
                if (activeTab === 'departamentos') openModalDepartamento();
                else openModalProducto();
            });
        }

        document.getElementById('btnGuardarDepto')?.addEventListener('click', saveDepartamento);
        document.getElementById('btnGuardarProducto')?.addEventListener('click', saveProducto);

        // --- Live Preview Listeners ---
        ['prod_nombre', 'prod_precio'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', updateLivePreview);
            if (id === 'prod_precio') {
                el.addEventListener('blur', updateLivePreview);
                el.addEventListener('change', updateLivePreview);
            }
        });

        initColorPickers(updateLivePreview);
        return;

        // --- Paletas de Colores (Nueva Lógica Popover) ---
        document.querySelectorAll('.color-swatch-btn').forEach(trigger => {
            trigger.addEventListener('click', function (e) {
                e.stopPropagation();
                const popover = this.closest('.color-picker-component').querySelector('.color-picker-popover');
                const isHidden = popover.classList.contains('hidden');

                // Cerrar otros
                document.querySelectorAll('.color-picker-popover').forEach(p => p.classList.add('hidden'));

                if (isHidden) popover.classList.remove('hidden');
            });
        });

        // --- Cerrar Popover con Boton X ---
        document.querySelectorAll('.popover-close-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                this.closest('.color-picker-popover')?.classList.add('hidden');
            });
        });

        document.querySelectorAll('.swatch').forEach(sw => {
            sw.addEventListener('click', function (e) {
                e.stopPropagation();
                const palette = this.closest('.color-palette');
                const popover = this.closest('.color-picker-popover');
                const component = popover.closest('.color-picker-component');
                const triggerId = component.querySelector('.color-swatch-btn').id;
                const targetId = palette.dataset.target;
                const color = this.dataset.color;

                // Actualizar input oculto
                const input = document.getElementById(targetId);
                if (input) input.value = color;

                // Actualizar UI del disparador (Preview)
                const trigger = document.getElementById(triggerId);
                if (trigger) {
                    const preview = trigger.querySelector('.color-dot');
                    if (preview) preview.style.backgroundColor = color;
                }

                // Actualizar Swatches activos
                palette.querySelectorAll('.swatch').forEach(s => s.classList.remove('is-active'));
                this.classList.add('is-active');

                // Actualizar Live Preview
                updateLivePreview();

                // Cerrar popover
                popover.classList.add('hidden');
            });
        });

        // Cerrar al clicar fuera
        document.addEventListener('click', () => {
            document.querySelectorAll('.color-picker-popover').forEach(p => p.classList.add('hidden'));
        });
    }

    function syncSwatchesLegacy(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const val = input.value.toLowerCase();
        const palette = document.querySelector(`.color-palette[data-target="${inputId}"]`);
        if (!palette) return;

        // Sincronizar previsualización del trigger
        const popover = palette.closest('.color-picker-popover');
        if (popover) {
            const trigger = popover.closest('.color-picker-component').querySelector('.color-swatch-btn');
            const preview = trigger ? trigger.querySelector('.color-dot') : null;
            if (preview) preview.style.backgroundColor = val;
        }

        palette.querySelectorAll('.swatch').forEach(sw => {
            if (sw.dataset.color.toLowerCase() === val) {
                sw.classList.add('is-active');
            } else {
                sw.classList.remove('is-active');
            }
        });
    }

    window.resetColor = function (inputId, defaultColor) {
        resetPickerColor(inputId, defaultColor, updateLivePreview);
    };

    window.closeModal = function (modalId) {
        document.getElementById(modalId)?.classList.add('hidden');
    };

    // API unificada de dialogos de aplicacion
    const UI = window.UI;
    const Notify = window.Notify;

    function openModalById(modalId) {
        document.getElementById(modalId)?.classList.remove('hidden');
    }

    ({ updateLivePreview } = initCatalogoExtras({
        escapeHtml,
        getCookie,
        openModalById,
        ui: UI
    }));
    init();

    // ==========================================
    // 6. GESTIÓN DE DEPARTAMENTOS
    // ==========================================
    async function loadDepartamentos() {
        const tbody = document.getElementById('tbody-departamentos');
        try {
            departamentosData = await fetchDepartamentos();
            isInitialLoadDepto = false;
            updateDeptSelects();
            renderDepartamentos();
            if (activeTab === 'productos') renderProductos();
        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${t('catalogo.departments.loadError', 'Error al cargar datos.')}</td></tr>`;
        }
    }

    function renderDepartamentos() {
        syncFilterState();
        const { searchString } = getFilterState();
        const filtered = applySorting(departamentosData.filter(d => {
            if (searchString) {
                return String(d.id).includes(searchString) || d.nombre.toLowerCase().includes(searchString);
            }
            return true;
        }));
        renderDepartamentosTable({
            departamentos: filtered,
            isInitialLoad: isInitialLoadDepto,
            t,
        });
    }

    window.openModalDepartamento = function () {
        document.getElementById('formDepartamento')?.reset();
        document.getElementById('depto_id').value = '';
        document.getElementById('modalDeptoTitle').innerText = t('catalogo.newDepartment', 'Nuevo Departamento');
        openModalById('modalDepartamento');
        document.getElementById('depto_nombre')?.focus();
    };

    window.editDepartamento = function (id) {
        const depto = departamentosData.find(d => d.id === id);
        if (!depto) return;

        document.getElementById('depto_id').value = depto.id;
        document.getElementById('depto_nombre').value = depto.nombre;
        document.getElementById('depto_activo').checked = depto.activo;

        document.getElementById('modalDeptoTitle').innerText = 'Editar Departamento';
        openModalById('modalDepartamento');
    };

    async function saveDepartamento() {
        const id = document.getElementById('depto_id').value;
        const nombre = document.getElementById('depto_nombre').value.trim();
        const activo = document.getElementById('depto_activo').checked;

        if (!nombre) {
            Notify.info('El nombre es obligatorio');
            return;
        }

        const payload = { nombre, activo };
        try {
            const resp = await saveDepartamentoApi(id, payload);

            if (resp.ok) {
                closeModal('modalDepartamento');
                loadDepartamentos(); // Recargar grilla
            } else {
                Notify.error(t('catalogo.department.saveError', 'Error al guardar el departamento'));
            }
        } catch (err) { console.error(err); }
    }

    window.deleteDepartamento = async function (id) {
        // 1. Verificar si tiene productos asociados
        const prods = (productosData || []).filter(p => p.departamento == id);

        if (prods.length > 0) {
            const listHtml = prods.map(p => `<li>${escapeHtml(p.nombre)}</li>`).join('');
            UI.dialog({
                    title: 'Acción protegida',
                message: `
                    <p class="mb-3">Este departamento tiene <strong>${prods.length}</strong> productos activos y no puede eliminarse.</p>
                    <div style="max-height: 160px; overflow-y: auto; background: rgba(0,0,0,0.15); padding: 8px 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; text-align: left;">
                        <ul style="margin: 0; padding-left: 18px; color: var(--text); opacity: 0.9; font-size: 0.9rem;">
                            ${listHtml}
                        </ul>
                    </div>
                `,
                type: 'lock',
                confirmText: 'Entendido',
                showCancel: false
            });
            return;
        }

        const confirmed = await Notify.confirmDanger(
                t('catalogo.department.confirmDelete', '¿Seguro que deseas eliminar este departamento? No contiene productos.'),
            { title: t('catalogo.department.deleteTitle', 'Eliminar Departamento') }
        );
        if (!confirmed) return;

        try {
            const resp = await deleteDepartamentoApi(id);
            if (resp.ok) {
                loadDepartamentos();
            } else {
                Notify.error(t('catalogo.department.deleteError', 'Error al eliminar'));
            }
        } catch (err) { console.error(err); }
    };

    // ==========================================
    // 7. GESTIÓN DE PRODUCTOS
    // ==========================================
    async function loadProductos() {
        const tbody = document.getElementById('tbody-productos');
        try {
            productosData = await fetchProductos(); // Cache
            isInitialLoadProd = false;
            renderProductos();

        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${t('catalogo.products.loadError', 'Error al cargar productos.')}</td></tr>`;
        }
    }

    function renderProductos() {
        syncFilterState();
        const { searchString, deptoFilterId } = getFilterState();
        const filtered = applySorting(productosData.filter(p => {
            const matchesSearch = searchString ? (String(p.id).includes(searchString) || p.nombre.toLowerCase().includes(searchString)) : true;
            const matchesDepto = deptoFilterId ? String(p.departamento) === deptoFilterId : true;
            return matchesSearch && matchesDepto;
        }));
        renderProductosTable({
            productos: filtered,
            departamentos: departamentosData,
            isInitialLoad: isInitialLoadProd,
            t,
        });
    }

    // ==========================================
    // 8. UTILIDADES Y SELECTORES
    // ==========================================
    function updateDeptSelects() {
        updateDepartmentSelects({ departamentos: departamentosData, t });
    }

    async function loadImpresoras() {
        try {
            impresorasData = await fetchImpresoras();
            updateImpresoraSelect({ impresoras: impresorasData, t });
        } catch (err) {
            console.error(err);
        }
    }

    window.openModalProducto = function () {
        document.getElementById('formProducto')?.reset();
        document.getElementById('prod_id').value = '';
        document.getElementById('prod_color_boton').value = '#2ecc71'; // Default background color (verde clarillo)
        document.getElementById('prod_color_texto').value = '#ffffff'; // Default text color
        document.getElementById('prod_icono_boton').value = ''; // Default icon
        document.getElementById('iconPreview').innerHTML = ''; // Reset UI preview
        updateImpresoraSelect({ impresoras: impresorasData, t, currentValue: '' }); // Limpiar opción heredada de una edición previa
        document.getElementById('modalProdTitle').innerText = t('catalogo.newProduct', 'Nuevo Producto');

        // Si no hay departamentos, avisar
        if (departamentosData.length === 0) {
            Notify.info("Aviso: Primero debes crear al menos un Departamento.");
        }

        openModalById('modalProducto');

        // Sincronizar UI de paletas al abrir nuevo (Reset a verde/blanco)
        syncSwatches('prod_color_boton');
        syncSwatches('prod_color_texto');

        // Fase 2: Reset Configurable
        const switchConfig = document.getElementById('prod_es_configurable');
        if (switchConfig) {
            switchConfig.checked = false;
            switchConfig.dispatchEvent(new Event('change'));
        }

        updateLivePreview();
        document.getElementById('prod_nombre')?.focus();
    };

    window.editProducto = function (id) {
        const p = productosData.find(x => x.id === id);
        if (!p) return;

        document.getElementById('prod_id').value = p.id;
        document.getElementById('prod_nombre').value = p.nombre;
        document.getElementById('prod_precio').value = p.precio;
        document.getElementById('prod_departamento').value = p.departamento || '';
        document.getElementById('prod_activo').checked = p.activo;

        // Extended Fields
        document.getElementById('prod_nombre_factura').value = p.nombre_factura || '';
        document.getElementById('prod_nombre_comanda').value = p.nombre_comanda || '';
        updateImpresoraSelect({ impresoras: impresorasData, t, currentValue: p.impresora || '' });

        document.getElementById('prod_color_boton').value = p.color_boton || '#2c3e50';
        document.getElementById('prod_color_texto').value = p.color_texto || '#ffffff';
        // Sincronizar UI de paletas
        syncSwatches('prod_color_boton');
        syncSwatches('prod_color_texto');
        document.getElementById('prod_icono_boton').value = p.icono_boton || '';

        const preview = document.getElementById('iconPreview');
        if (p.icono_boton) {
            // Unificar: Si el valor guardado es una ruta, la usamos directly.
            // Si es un nombre de archivo, prefijamos (legacy)
            const src = p.icono_boton.includes('/') ? p.icono_boton : `/static/ui/img/productos/${p.icono_boton}`;
            preview.innerHTML = `<img src="${src}" style="width:24px;height:24px;object-fit:contain;">`;
        } else {
            preview.innerHTML = '';
        }

        // Fase 2: Sincronizar Configurable
        const switchConfig = document.getElementById('prod_es_configurable');
        if (switchConfig) {
            switchConfig.checked = p.es_configurable || false;
            // Forzar el evento change para actualizar las etiquetas
            switchConfig.dispatchEvent(new Event('change'));
        }

        document.getElementById('modalProdTitle').innerText = 'Editar Producto';
        openModalById('modalProducto');
        updateLivePreview();
    };

    async function saveProducto() {
        const id = document.getElementById('prod_id').value;
        const nombre = document.getElementById('prod_nombre').value.trim();
        let precio = document.getElementById('prod_precio').value.trim();
        precio = precio.replace(',', '.'); // Reemplazar comas por seguridad en caso the submit sin blur

        const departamento = document.getElementById('prod_departamento').value;
        const activo = document.getElementById('prod_activo').checked;
        const nombre_factura = document.getElementById('prod_nombre_factura').value.trim();
        const nombre_comanda = document.getElementById('prod_nombre_comanda').value.trim();
        const impresora = document.getElementById('prod_impresora').value.trim();
        const color_boton = document.getElementById('prod_color_boton').value;
        const color_texto = document.getElementById('prod_color_texto').value;
        const icono_boton = document.getElementById('prod_icono_boton').value.trim();
        const es_configurable = document.getElementById('prod_es_configurable')?.checked || false;

        if (!nombre) {
            Notify.info('El nombre del producto es obligatorio.');
            return;
        }

        if (!departamento) {
            Notify.info('Debes seleccionar un departamento para guardar el producto.');
            return;
        }

        // Validación y confirmación de precio 0
        if (!precio || parseFloat(precio) === 0) {
            const confirmedZero = await Notify.confirm(
                t('catalogo.product.zeroPriceConfirm', 'El importe del producto es 0. ¿Estás seguro?'),
                { title: t('catalogo.product.zeroPriceTitle', 'Precio en 0') }
            );
            if (!confirmedZero) return;
            if (!precio) precio = "0.00"; // Asegurar que viaja como numero
        }

        // Confirmación de impresora vacía
        if (!impresora) {
            const confirmedNoPrinter = await Notify.confirm(
                t('catalogo.product.noPrinterConfirm', 'No ha seleccionado ninguna impresora (factura/comanda). ¿Está seguro?'),
                { title: t('catalogo.product.noPrinterTitle', 'Sin impresora') }
            );
            if (!confirmedNoPrinter) return;
        }

        const payload = {
            nombre,
            precio,
            departamento: departamento ? parseInt(departamento) : null,
            activo,
            nombre_factura,
            nombre_comanda,
            impresora,
            color_boton,
            color_texto,
            icono_boton,
            es_configurable
        };

        try {
            const resp = await saveProductoApi(id, payload);

            if (resp.ok) {
                closeModal('modalProducto');
                loadProductos(); // Recargar grilla
            } else {
                let errorMsg = t('catalogo.product.saveError', 'Error al guardar el producto');
                try {
                    const errorData = await resp.json();
                    if (errorData.nombre) {
                        errorMsg = errorData.nombre.join ? errorData.nombre[0] : errorData.nombre;
                    } else if (typeof errorData === 'object') {
                        // Intentar pillar cualquier otro error
                        errorMsg = JSON.stringify(errorData);
                    }
                } catch (e) { /* ignore */ }
                Notify.error(errorMsg, { title: t('catalogo.product.saveErrorTitle', 'Error al guardar') });
            }
        } catch (err) {
            console.error("Save error:", err);
        }
    }

    window.deleteProducto = async function (id) {
        const confirmed = await Notify.confirmDanger(
                    t('catalogo.product.confirmDelete', '¿Seguro que deseas eliminar este producto?'),
            { title: t('catalogo.product.deleteTitle', 'Eliminar producto') }
        );
        if (!confirmed) return;

        try {
            const resp = await deleteProductoApi(id);
            if (resp.ok) {
                loadProductos();
            } else {
                Notify.error(t('catalogo.product.deleteError', 'Error al eliminar producto'));
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogoApp);
} else {
    initCatalogoApp();
}
