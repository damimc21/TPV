/* ============================================================
   GESTIÓN DEL CATÁLOGO TPV (SPA)
   Este archivo maneja la lógica de la vista única para 
   administrar Departamentos y Productos.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // Referencias a elementos de la interfaz
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');
    const btnNuevo = document.getElementById('btnNuevo');

    // Estado de la aplicación y Filtros
    let hash = window.location.hash ? window.location.hash.substring(1) : '';
    let activeTab = (hash === 'departamentos' || hash === 'productos') ? hash : 'departamentos';

    let searchString = '';
    let sortField = 'id';    // 'id' | 'nombre' | 'precio' | 'activo'
    let sortDir = 'asc';     // 'asc' | 'desc'
    let deptoFilterId = '';

    // Caché local de datos
    let departamentosData = [];
    let productosData = [];
    let isInitialLoadDepto = true;
    let isInitialLoadProd = true;

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
    }

    init();

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
            ? `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Departamento`
            : `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Producto`;

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
    // --- Helper Custom Select ---
    function initCustomSelect(id, onSelect) {
        const el = document.getElementById(id);
        if (!el) return;
        const trigger = el.querySelector('.custom-select-trigger');
        
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            el.classList.toggle('is-active');
            document.querySelectorAll('.custom-select').forEach(other => {
                if (other !== el) other.classList.remove('is-active');
            });
        });

        el.addEventListener('click', (e) => {
            const opt = e.target.closest('.custom-option');
            if (opt) {
                const val = opt.getAttribute('data-value');
                trigger.querySelector('span').textContent = opt.textContent;
                el.querySelectorAll('.custom-option').forEach(o => o.classList.remove('is-selected'));
                opt.classList.add('is-selected');
                el.classList.remove('is-active');
                if (onSelect) onSelect(val);
            }
        });
    }

    function getCustomSelectValue(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        const selected = el.querySelector('.custom-option.is-selected');
        return selected ? selected.getAttribute('data-value') : '';
    }

    function setCustomSelectValue(id, val, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll('.custom-option').forEach(opt => {
            if (opt.getAttribute('data-value') === String(val)) {
                opt.classList.add('is-selected');
                el.querySelector('.custom-select-trigger span').textContent = text || opt.textContent;
            } else {
                opt.classList.remove('is-selected');
            }
        });
    }

    function initFilters() {
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
                setCustomSelectValue('customFilterDepto', '', '-- Todos los Deptos --');
                setCustomSelectValue('customSortField', 'id', 'ID');
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
                ? `<img src="/static/ui/img/iconos/move-up.svg" alt=""> <span id="sortDirText">Ascendente</span>` 
                : `<img src="/static/ui/img/iconos/move-down.svg" alt=""> <span id="sortDirText">Descendente</span>`;
            sortDirBtn.title = sortDir === 'asc' ? 'Ascendente' : 'Descendente';
        }
    }

    function syncFilterState() {
        searchString = (document.getElementById('searchInput')?.value || '').toLowerCase();
        sortField = getCustomSelectValue('customSortField') || 'id';
        deptoFilterId = getCustomSelectValue('customFilterDepto') || '';
    }

    function applySorting(array) {
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
    function initProductUI() {
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

        // --- Paletas de Colores (Nueva Lógica Popover) ---
        document.querySelectorAll('.color-swatch-btn').forEach(trigger => {
            trigger.addEventListener('click', function(e) {
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
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                this.closest('.color-picker-popover')?.classList.add('hidden');
            });
        });

        document.querySelectorAll('.swatch').forEach(sw => {
            sw.addEventListener('click', function(e) {
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

    function syncSwatches(inputId) {
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

    window.resetColor = function(inputId, defaultColor) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = defaultColor;
            syncSwatches(inputId);
            updateLivePreview();
        }
    };

    window.closeModal = function (modalId) {
        document.getElementById(modalId)?.classList.add('hidden');
    };

    // ==========================================
    // DIÁLOGOS UNIVERSALES (Alert/Confirm)
    // ==========================================
    const UI = {
        dialog: function(options) {
            const modal = document.getElementById('modalDialog');
            if (!modal) return;

            const title = document.getElementById('dialogTitle');
            const message = document.getElementById('dialogMessage');
            const btnConfirm = document.getElementById('btnDialogConfirm');
            const btnCancel = document.getElementById('btnDialogCancel');
            const iconContainer = document.getElementById('dialogIcon');

            title.textContent = options.title || 'Aviso';
            message.innerHTML = options.message || '';
            btnConfirm.textContent = options.confirmText || 'Aceptar';
            btnCancel.textContent = options.cancelText || 'Cancelar';
            
            // Iconos segun tipo
            iconContainer.className = 'modal-dialog-icon';
            let iconImg = '/static/ui/img/iconos/alert-circle.svg';
            if (options.type === 'danger') {
                iconContainer.classList.add('modal-dialog-icon--danger');
                iconImg = '/static/ui/img/iconos/trash-2.svg';
            } else if (options.type === 'lock') {
                iconContainer.classList.add('modal-dialog-icon--lock');
                iconImg = '/static/ui/img/iconos/lock-keyhole.svg';
            } else if (options.type === 'warning') {
                iconContainer.classList.add('modal-dialog-icon--warning');
            }
            iconContainer.innerHTML = `<img src="${iconImg}" alt="">`;

            // Boton destructivo
            btnConfirm.className = 'btn ' + (options.type === 'danger' ? 'btn--danger' : 'btn--primary');
            
            btnCancel.style.display = options.showCancel ? 'block' : 'none';

            modal.classList.remove('hidden');

            return new Promise((resolve) => {
                const handleConfirm = () => {
                    modal.classList.add('hidden');
                    btnConfirm.removeEventListener('click', handleConfirm);
                    btnCancel.removeEventListener('click', handleCancel);
                    resolve(true);
                };
                const handleCancel = () => {
                    modal.classList.add('hidden');
                    btnConfirm.removeEventListener('click', handleConfirm);
                    btnCancel.removeEventListener('click', handleCancel);
                    resolve(false);
                };
                btnConfirm.addEventListener('click', handleConfirm);
                btnCancel.addEventListener('click', handleCancel);
            });
        },
        alert: function(msg, title = 'Aviso') {
            return this.dialog({ title, message: msg, showCancel: false });
        },
        confirm: function(msg, title = 'Confirmar', type = 'primary') {
            return this.dialog({ title, message: msg, showCancel: true, type });
        }
    };

    function openModalById(modalId) {
        document.getElementById(modalId)?.classList.remove('hidden');
    }

    // ==========================================
    // 6. GESTIÓN DE DEPARTAMENTOS
    // ==========================================
    async function loadDepartamentos() {
        const tbody = document.getElementById('tbody-departamentos');
        try {
            const resp = await fetch('/api/departamentos/');
            if (!resp.ok) throw new Error('Error en API departamentos');
            departamentosData = await resp.json();
            isInitialLoadDepto = false;
            updateDeptSelects();
            renderDepartamentos();
            if (activeTab === 'productos') renderProductos();
        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar datos.</td></tr>';
        }
    }

    function renderDepartamentos() {
        const tbody = document.getElementById('tbody-departamentos');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Leer estado de filtros directamente del DOM
        syncFilterState();

        // 1. Filtrar
        let filtered = departamentosData.filter(d => {
            if (searchString) {
                return String(d.id).includes(searchString) || d.nombre.toLowerCase().includes(searchString);
            }
            return true;
        });

        // 2. Ordenar
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            if (isInitialLoadDepto) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Cargando departamentos...</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se encontraron departamentos.</td></tr>';
            }
            return;
        }

        filtered.forEach((d) => {
            const statusHtml = d.activo
                ? `<span class="status-badge active">ACTIVO</span>`
                : `<span class="status-badge inactive">INACTIVO</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${d.id}</td>
                <td class="font-weight-bold">${escapeHtml(d.nombre)}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar" onclick="editDepartamento(${d.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deleteDepartamento(${d.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.openModalDepartamento = function () {
        document.getElementById('formDepartamento')?.reset();
        document.getElementById('depto_id').value = '';
        document.getElementById('modalDeptoTitle').innerText = 'Nuevo Departamento';
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
            UI.alert('El nombre es obligatorio');
            return;
        }

        const payload = { nombre, activo };
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/departamentos/${id}/` : '/api/departamentos/';

        try {
            const resp = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                closeModal('modalDepartamento');
                loadDepartamentos(); // Recargar grilla
            } else {
                UI.alert('Error al guardar el departamento');
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

        const confirmed = await UI.confirm(
            '¿Seguro que deseas eliminar este departamento? No contiene productos.',
            'Eliminar Departamento',
            'danger'
        );
        if (!confirmed) return;

        try {
            const resp = await fetch(`/api/departamentos/${id}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCookie('csrftoken') }
            });
            if (resp.ok) {
                loadDepartamentos();
            } else {
                UI.alert('Error al eliminar');
            }
        } catch (err) { console.error(err); }
    };

    // ==========================================
    // 7. GESTIÓN DE PRODUCTOS
    // ==========================================
    async function loadProductos() {
        const tbody = document.getElementById('tbody-productos');
        try {
            const resp = await fetch('/api/productos/');
            if (!resp.ok) throw new Error('Error en API productos');
            productosData = await resp.json(); // Cache
            isInitialLoadProd = false;
            renderProductos();

        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar productos.</td></tr>';
        }
    }

    function renderProductos() {
        const tbody = document.getElementById('tbody-productos');
        if (!tbody) return;
        tbody.innerHTML = ''; // Limpiar

        // Leer estado de filtros directamente del DOM
        syncFilterState();

        // 1. Filtrar
        let filtered = productosData.filter(p => {
            let matchesSearch = searchString ? (String(p.id).includes(searchString) || p.nombre.toLowerCase().includes(searchString)) : true;
            let matchesDepto = deptoFilterId ? String(p.departamento) === deptoFilterId : true;
            return matchesSearch && matchesDepto;
        });

        // 2. Ordenar
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            if (isInitialLoadProd) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Cargando productos...</td></tr>';
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron productos.</td></tr>';
            }
            return;
        }

        filtered.forEach((p) => {
            const statusHtml = p.activo
                ? `<span class="status-badge active">ACTIVO</span>`
                : `<span class="status-badge inactive">INACTIVO</span>`;

            const deptoObj = departamentosData.find(d => d.id === p.departamento);
            const deptoNombre = deptoObj ? escapeHtml(deptoObj.nombre) : '<span class="text-muted">Sin categoría</span>';

            const precioFmt = parseFloat(p.precio).toFixed(2) + ' €';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${p.id}</td>
                <td class="font-weight-bold">${escapeHtml(p.nombre)}</td>
                <td>${deptoNombre}</td>
                <td class="text-right tabular-nums">${precioFmt}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar" onclick="editProducto(${p.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deleteProducto(${p.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ==========================================
    // 8. UTILIDADES Y SELECTORES
    // ==========================================
    function updateDeptSelects() {
        // selectModal sigue siendo nativo (está en un modal estándar de edición)
        const selectModal = document.getElementById('prod_departamento');
        const deptoOptions = document.getElementById('deptoOptions');
        if (!selectModal || !deptoOptions) return;

        // Reset Modal Select
        selectModal.innerHTML = '<option value="">-- Seleccionar --</option>';
        
        // Reset Filter Custom Select
        deptoOptions.innerHTML = '<div class="custom-option is-selected" data-value="">-- Todos los Deptos --</div>';

        departamentosData.forEach(d => {
            // Para el modal (nativo)
            const opt = `<option value="${d.id}">${escapeHtml(d.nombre)}</option>`;
            selectModal.insertAdjacentHTML('beforeend', opt);

            // Para el filtro (custom)
            const div = document.createElement('div');
            div.className = 'custom-option';
            div.setAttribute('data-value', d.id);
            div.textContent = d.nombre;
            deptoOptions.appendChild(div);
        });
    }

    window.openModalProducto = function () {
        document.getElementById('formProducto')?.reset();
        document.getElementById('prod_id').value = '';
        document.getElementById('prod_color_boton').value = '#2ecc71'; // Default background color (verde clarillo)
        document.getElementById('prod_color_texto').value = '#ffffff'; // Default text color
        document.getElementById('prod_icono_boton').value = ''; // Default icon
        document.getElementById('iconPreview').innerHTML = ''; // Reset UI preview
        document.getElementById('modalProdTitle').innerText = 'Nuevo Producto';

        // Si no hay departamentos, avisar
        if (departamentosData.length === 0) {
            alert("Aviso: Primero debes crear al menos un Departamento.");
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
        document.getElementById('prod_impresora').value = p.impresora || '';
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
            alert('El nombre del producto es obligatorio.');
            return;
        }

        if (!departamento) {
            alert('Debes seleccionar un departamento para guardar el producto.');
            return;
        }

        // Validación y confirmación de precio 0
        if (!precio || parseFloat(precio) === 0) {
            const confirmedZero = await UI.confirm('El importe del producto es 0. ¿Estás seguro?', 'Precio en 0', 'warning');
            if (!confirmedZero) return;
            if (!precio) precio = "0.00"; // Asegurar que viaja como numero
        }

        // Confirmación de impresora vacía
        if (!impresora) {
            const confirmedNoPrinter = await UI.confirm('No ha seleccionado ninguna impresora (factura/comanda). ¿Está seguro?', 'Sin Impresora', 'warning');
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

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/productos/${id}/` : '/api/productos/';

        try {
            const resp = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                closeModal('modalProducto');
                loadProductos(); // Recargar grilla
            } else {
                let errorMsg = 'Error al guardar el producto';
                try {
                    const errorData = await resp.json();
                    if (errorData.nombre) {
                        errorMsg = errorData.nombre.join ? errorData.nombre[0] : errorData.nombre;
                    } else if (typeof errorData === 'object') {
                        // Intentar pillar cualquier otro error
                        errorMsg = JSON.stringify(errorData);
                    }
                } catch (e) { /* ignore */ }
                UI.alert(errorMsg, 'Error al guardar');
            }
        } catch (err) {
            console.error("Save error:", err);
        }
    }

    window.deleteProducto = async function (id) {
        const confirmed = await UI.confirm(
            '¿Seguro que deseas eliminar este producto?',
            'Eliminar Producto',
            'danger'
        );
        if (!confirmed) return;

        try {
            const resp = await fetch(`/api/productos/${id}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                }
            });
            if (resp.ok) {
                loadProductos();
            } else {
                UI.alert('Error al eliminar producto');
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==========================================
    // 9. NAVEGADOR DE ICONOS
    // ==========================================
    window.openModalIconos = async function () {
        const modal = document.getElementById('modalIconos');
        const grid = document.getElementById('iconosGrid');
        if (!modal || !grid) return;

        // Limpiar cabecera previa si existe
        const oldHeader = modal.querySelector('.modal-tabs-mini');
        if (oldHeader) oldHeader.remove();

        grid.innerHTML = '<p class="p-4 text-center">Cargando iconos...</p>';
        modal.classList.remove('hidden');

        try {
            const response = await fetch('/api/catalogo/iconos/');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            const categorias = data.categorias || {};
            const catNames = Object.keys(categorias);

            if (catNames.length === 0) {
                grid.innerHTML = '<p class="p-4 text-center text-muted">No hay iconos disponibles.</p>';
                return;
            }

            // Crear contenedor de pestañas (filtros por carpeta)
            const tabsHeader = document.createElement('div');
            tabsHeader.className = 'modal-tabs-mini';
            
            catNames.forEach((name, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `tab-mini ${index === 0 ? 'is-active' : ''}`;
                btn.textContent = name;
                
                btn.onclick = () => {
                    tabsHeader.querySelectorAll('.tab-mini').forEach(b => b.classList.remove('is-active'));
                    btn.classList.add('is-active');
                    renderCategory(categorias[name], grid);
                };
                
                tabsHeader.appendChild(btn);
            });

            grid.before(tabsHeader);
            
            // Render inicial de la primera categoría
            renderCategory(categorias[catNames[0]], grid);

        } catch (error) {
            console.error('Error al cargar iconos:', error);
            grid.innerHTML = '<p class="p-4 text-center text-danger">Error al cargar iconos.</p>';
        }
    };

    function renderCategory(icons, container) {
        container.innerHTML = '';
        icons.forEach(icono => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'icono-item';
            item.innerHTML = `
                <div class="icono-item__preview">
                    <img src="${icono.url}" alt="${icono.nombre}">
                </div>
                <span>${icono.nombre.split('.')[0]}</span>
            `;
            item.addEventListener('click', () => window.seleccionarIcono(icono));
            container.appendChild(item);
        });
    }

    window.seleccionarIcono = function (icono) {
        const hiddenInput = document.getElementById('prod_icono_boton');
        const preview = document.getElementById('iconPreview');
        
        if (hiddenInput) hiddenInput.value = icono.url;
        if (preview) preview.innerHTML = `<img src="${icono.url}" alt="${icono.nombre}" style="width:24px;height:24px;object-fit:contain;">`;
        
        updateLivePreview();
        closeModal('modalIconos');
    };

    function updateLivePreview() {
        const previewWrap = document.getElementById('tpvLivePreview');
        if (!previewWrap) return;

        const nombre = document.getElementById('prod_nombre').value || 'Producto';
        const precio = document.getElementById('prod_precio').value || '0.00';
        const colorBoton = document.getElementById('prod_color_boton').value;
        const colorTexto = document.getElementById('prod_color_texto').value;
        const iconoId = document.getElementById('prod_icono_boton').value;
        
        let content = '';
        let extraClass = 'producto-mock--no-img';
        
        if (iconoId) {
            extraClass = 'producto-mock--with-img';
            const src = iconoId.includes('/') ? iconoId : `/static/ui/img/productos/${iconoId}`;
            content = `
                <img src="${src}" class="producto-mock__img" onerror="this.style.display='none'">
                <div class="producto-mock__info" style="color: ${colorTexto}">
                    <div class="producto-mock__name">${nombre}</div>
                    <div class="producto-mock__price">${precio}€</div>
                </div>
            `;
        } else {
            content = `
                <div class="producto-mock--no-img-content">
                    <div class="producto-mock__name" style="color: ${colorTexto}">${nombre}</div>
                    <div class="producto-mock__price" style="color: ${colorTexto}; opacity: 0.8;">${precio}€</div>
                </div>
            `;
        }

        previewWrap.innerHTML = `
            <div class="producto-mock ${extraClass}" style="background-color: ${colorBoton}">
                ${content}
            </div>
        `;
    }

    window.updateLivePreview = updateLivePreview;

    // ==========================================
    // 10. GESTIÓN DE PLANTILLAS CONFIGURABLES (Fase 2)
    // ==========================================
    document.getElementById('prod_es_configurable')?.addEventListener('change', function() {
        const btnEdit = document.getElementById('btnEditConfigTemplate');
        const pvpLabel = document.querySelector('label[for="prod_precio"]');
        const facturaLabel = document.querySelector('label[for="prod_nombre_factura"]');
        const comandaLabel = document.querySelector('label[for="prod_nombre_comanda"]');
        
        if (this.checked) {
            btnEdit.classList.remove('hidden');
            if(pvpLabel) pvpLabel.textContent = 'Precio Base (€)';
            if(facturaLabel) facturaLabel.textContent = 'Nombre en factura base';
            if(comandaLabel) comandaLabel.textContent = 'Nombre en comanda base';
        } else {
            btnEdit.classList.add('hidden');
            if(pvpLabel) pvpLabel.textContent = 'P.V.P (€)';
            if(facturaLabel) facturaLabel.textContent = 'Nombre en factura';
            if(comandaLabel) comandaLabel.textContent = 'Nombre en comanda';
        }
    });

    let currentPlantilla = null;

    window.openConfigTemplateManager = async function() {
        const prodId = document.getElementById('prod_id').value;
        if (!prodId) {
            alert("Primero guarda el producto para poder editar su plantilla.");
            return;
        }

        openModalById('modalConfigTemplate');
        
        // Cargar datos actuales de la plantilla
        try {
            const resp = await fetch(`/api/productos/${prodId}/plantilla/`);
            if (resp.ok) {
                currentPlantilla = await resp.json();
                renderConfigTemplate();
            } else {
                // Si no existe, inicializar estructura vacía
                currentPlantilla = { tiene_formatos: true, formatos: [], grupos: [] };
                renderConfigTemplate();
            }
        } catch (err) {
            console.error("Error loading template", err);
        }

        // Fetch de los perfiles para importar (Silencioso para caché)
        if (!window.cachedPerfiles) window.cachedPerfiles = { suplementos: [], comentarios: [] };
        fetch('/api/perfiles-suplementos/').then(r => r.ok ? r.json() : []).then(d => { window.cachedPerfiles.suplementos = d; renderConfigTemplate(); }).catch(e => {});
        fetch('/api/perfiles-comentarios/').then(r => r.ok ? r.json() : []).then(d => { window.cachedPerfiles.comentarios = d; renderConfigTemplate(); }).catch(e => {});
    };

    function renderConfigTemplate() {
        if (!currentPlantilla) return;
        
        const hasFormatos = currentPlantilla.formatos && currentPlantilla.formatos.length > 0;
        currentPlantilla.tiene_formatos = hasFormatos;
        
        // Render Formatos
        const formatsList = document.getElementById('configFormatsList');
        formatsList.innerHTML = '';
        (currentPlantilla.formatos || []).forEach((f, idx) => {
            const div = document.createElement('div');
            div.className = 'config-format-item';
            div.innerHTML = `
                <div class="flex" style="gap: 8px; margin-bottom: 8px; align-items: center;">
                    <div class="flex-1">
                        <label class="text-tiny text-muted mb-1 block uppercase tracking-wider">Nombre</label>
                        <input type="text" class="form-control form-control--elegant w-100" placeholder="Ej: Media" value="${escapeHtml(f.nombre)}" onchange="updateFormat(${idx}, 'nombre', this.value)">
                    </div>
                    <button type="button" class="btn-trash-discrete mt-3" title="Eliminar Formato" onclick="removeFormat(${idx})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="">
                    </button>
                </div>
                <div class="flex" style="gap: 8px; align-items: center;">
                    <div class="flex-1">
                        <label class="text-tiny text-muted mb-1 block uppercase tracking-wider">Proporción</label>
                        <div style="position: relative;">
                            <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.4); font-size: 0.8rem; pointer-events: none;">×</span>
                            <input type="number" step="0.1" class="form-control form-control--compact w-100" style="padding-left: 20px;" value="${f.factor_precio || 1.0}" onchange="updateFormat(${idx}, 'factor_precio', this.value)">
                        </div>
                    </div>
                    <div class="flex-1">
                        <label class="text-tiny text-muted mb-1 block uppercase tracking-wider">Precio Fijo</label>
                        <div style="position: relative;">
                            <input type="number" step="0.01" class="form-control form-control--compact w-100" style="padding-right: 24px;" value="${f.precio_fijo || ''}" placeholder="Usar factor" onchange="updateFormat(${idx}, 'precio_fijo', this.value)">
                            <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.4); font-size: 0.8rem; pointer-events: none;">€</span>
                        </div>
                    </div>
                </div>
            `;
            formatsList.appendChild(div);
        });

        // Render Grupos
        const groupsList = document.getElementById('configGroupsList');
        groupsList.innerHTML = '';
        (currentPlantilla.grupos || []).forEach((g, gIdx) => {
            const div = document.createElement('div');
            div.className = 'config-group-item';
            div.innerHTML = `
                <div class="group-header" style="flex-direction: column; align-items: stretch; gap: 10px;">
                    <div class="flex justify-between items-center w-100">
                        <input type="text" class="input-transparent-title flex-1" value="${escapeHtml(g.nombre)}" placeholder="NOMBRE DEL GRUPO (Ej: TIPO DE PAN)" onchange="updateGroup(${gIdx}, 'nombre', this.value)">
                        <button type="button" class="btn-trash-discrete m-0" title="Eliminar Grupo" onclick="removeGroup(${gIdx})">
                            <img src="/static/ui/img/iconos/trash-2.svg" alt="">
                        </button>
                    </div>
                    <div class="flex items-center justify-between w-100 mt-1">
                        <select class="select-chic" onchange="updateGroup(${gIdx}, 'tipo_seleccion', this.value)">
                            <option value="UNICA" ${g.tipo_seleccion === 'UNICA' ? 'selected' : ''}>Selección Única</option>
                            <option value="MULTIPLE" ${g.tipo_seleccion === 'MULTIPLE' ? 'selected' : ''}>Selección Múltiple</option>
                            <option value="LIBRE" ${g.tipo_seleccion === 'LIBRE' ? 'selected' : ''}>Texto Libre</option>
                        </select>
                        <label class="form-switch m-0" style="height: auto; gap: 8px;">
                            <span class="text-mini text-muted">Obligatorio</span>
                            <div class="switch switch--sm">
                               <input type="checkbox" ${g.obligatorio ? 'checked' : ''} onchange="updateGroup(${gIdx}, 'obligatorio', this.checked)">
                               <span class="slider"></span>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="config-opciones-grid" id="group-options-${gIdx}">
                    <!-- Opciones inyectadas -->
                </div>
                
                <div class="flex items-center" style="gap: 10px; margin-top: 15px;">
                    <button type="button" class="btn-add-option-dashed flex-1 m-0" onclick="addOptionToGroup(${gIdx})">
                        + Añadir Opción
                    </button>
                    <button type="button" class="btn btn--subtle btn--compact m-0" style="height: 42px; border: 1px dashed rgba(255,255,255,0.2);" onclick="openImportModal(${gIdx})">
                        ⬇️ Importar...
                    </button>
                </div>
            `;
            groupsList.appendChild(div);
            
            // Render Opciones del grupo
            const optionsGrid = div.querySelector(`#group-options-${gIdx}`);
            if (g.tipo_seleccion === 'LIBRE') {
                const btnAdd = div.querySelector('.btn-add-option-dashed');
                if (btnAdd) btnAdd.style.display = 'none';
                optionsGrid.innerHTML = `
                    <div class="text-center p-3 text-muted text-mini w-100 flex-1 grid-col-span-full">
                        <em>Modo texto libre: El camarero escribirá la opción manualmente en el TPV. No se requieren opciones predefinidas.</em>
                    </div>
                `;
            } else {
                (g.opciones || []).forEach((o, oIdx) => {
                    let pricesHtml = '';
                    if (hasFormatos) {
                        if (!o.precios_formatos) o.precios_formatos = {};
                        pricesHtml += '<div class="prices-format-list" style="display:flex; flex-direction:column; gap:6px;">';
                        currentPlantilla.formatos.forEach((f, fIdx) => {
                            let val = o.precios_formatos[fIdx] !== undefined ? o.precios_formatos[fIdx] : '';
                            // Calcular qué precio tendría si se deja vacío (base * proporcion)
                            let pBase = parseFloat(o.precio_base) || 0;
                            let factor = parseFloat(f.factor_precio) || 1;
                            let placeholder = (pBase * factor).toFixed(2);

                            pricesHtml += `
                                <div class="flex items-center justify-between" style="gap: 8px;">
                                    <span class="text-tiny text-muted uppercase tracking-wider" style="max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(f.nombre)}">${escapeHtml(f.nombre || 'Formato')}</span>
                                    <div class="flex items-center">
                                        <input type="number" step="0.01" class="form-control form-control--compact form-control--minimal" style="width: 60px; text-align: right; padding-right: 4px;" value="${val}" placeholder="${placeholder}" onchange="updateOptionFormatPrice(${gIdx}, ${oIdx}, ${fIdx}, this.value)">
                                        <span class="text-muted text-tiny ml-1">€</span>
                                    </div>
                                </div>
                            `;
                        });
                        pricesHtml += '</div>';
                    } else {
                        pricesHtml = `
                            <div class="flex items-center justify-between" style="gap: 8px;">
                                <span class="text-tiny text-muted uppercase tracking-wider">Precio Único</span>
                                <div class="flex items-center">
                                    <input type="number" step="0.01" class="form-control form-control--compact form-control--minimal" style="width: 70px; text-align: right; padding-right: 4px;" value="${o.precio_base || ''}" placeholder="0.00" onchange="updateOption(${gIdx}, ${oIdx}, 'precio_base', this.value)">
                                    <span class="text-muted text-tiny ml-1">€</span>
                                </div>
                            </div>
                        `;
                    }
                    
                    let visComanda = o.visible_comanda !== false;
                    let visFactura = o.visible_factura !== false;
                    let esDefault = o.por_defecto === true;

                    const oDiv = document.createElement('div');
                    oDiv.className = 'config-opcion-card';
                    oDiv.innerHTML = `
                        <div class="opcion-card-header" style="flex-wrap: wrap; gap: 4px;">
                            <input type="text" class="input-invisible flex-1" style="min-width: 120px;" value="${escapeHtml(o.nombre)}" placeholder="Ej: Integral" onchange="updateOption(${gIdx}, ${oIdx}, 'nombre', this.value)">
                            <div class="flex items-center gap-1" title="Precio base de referencia">
                                <input type="number" step="0.01" class="form-control form-control--compact form-control--minimal" style="width: 55px; text-align: right; background: rgba(255,255,255,0.05);" value="${o.precio_base || '0.00'}" onchange="updateOption(${gIdx}, ${oIdx}, 'precio_base', this.value)">
                                <span class="text-muted" style="font-size: 0.7rem;">€</span>
                            </div>
                            <button type="button" class="btn-trash-discrete m-0" style="width:24px; height:24px;" onclick="removeOption(${gIdx}, ${oIdx})">
                                <img src="/static/ui/img/iconos/trash-2.svg" alt="" style="width:12px; height:12px;">
                            </button>
                        </div>
                        <div class="opcion-card-body">
                            ${pricesHtml}
                            <div class="flex items-center justify-between mt-2 pt-2" style="border-top: 1px solid rgba(255,255,255,0.05);">
                                <label class="custom-checkbox-wrap text-tiny text-muted" title="Por defecto preseleccionado">
                                    <input type="checkbox" ${esDefault ? 'checked' : ''} onchange="updateOption(${gIdx}, ${oIdx}, 'por_defecto', this.checked)">
                                    Por Defecto
                                </label>
                                <div class="flex items-center gap-3">
                                    <label class="custom-checkbox-wrap text-tiny text-muted" title="Imprimir en comanda">
                                        <input type="checkbox" ${visComanda ? 'checked' : ''} onchange="updateOption(${gIdx}, ${oIdx}, 'visible_comanda', this.checked)">
                                        Comanda
                                    </label>
                                    <label class="custom-checkbox-wrap text-tiny text-muted" title="Imprimir en factura">
                                        <input type="checkbox" ${visFactura ? 'checked' : ''} onchange="updateOption(${gIdx}, ${oIdx}, 'visible_factura', this.checked)">
                                        Factura
                                    </label>
                                </div>
                            </div>
                        </div>
                    `;
                    optionsGrid.appendChild(oDiv);
                });
            }
        });
    }

    let currentImportGroupIdx = null;

    window.openImportModal = (gIdx) => {
        currentImportGroupIdx = gIdx;
        document.getElementById('importProfileSearch').value = '';
        renderImportList('');
        showImportProfiles(); // Resetear a la vista de lista de perfiles
        openModalById('modalImportProfile');
    };

    window.filterImportProfiles = (query) => {
        renderImportList(query.toLowerCase());
    };

    function renderImportList(query) {
        const supContainer = document.getElementById('importListSuplementos');
        const comContainer = document.getElementById('importListComentarios');
        supContainer.innerHTML = '';
        comContainer.innerHTML = '';

        if (!window.cachedPerfiles) return;

        window.cachedPerfiles.suplementos.forEach(p => {
            if (query && !p.nombre.toLowerCase().includes(query)) return;
            supContainer.innerHTML += `
                <div class="profile-import-item" onclick="showProfileItems('sup', ${p.id})">
                    <span class="font-bold text-sm">${escapeHtml(p.nombre)}</span>
                    <span class="text-xs text-muted">${p.suplementos ? p.suplementos.length : 0} opciones</span>
                </div>
            `;
        });

        window.cachedPerfiles.comentarios.forEach(p => {
            if (query && !p.nombre.toLowerCase().includes(query)) return;
            comContainer.innerHTML += `
                <div class="profile-import-item" onclick="showProfileItems('com', ${p.id})">
                    <span class="font-bold text-sm">${escapeHtml(p.nombre)}</span>
                    <span class="text-xs text-muted">${p.comentarios ? p.comentarios.length : 0} opciones</span>
                </div>
            `;
        });
    }

    let itemsToImport = [];

    window.showImportProfiles = () => {
        document.getElementById('importProfilesView').classList.remove('hidden');
        document.getElementById('importItemsView').classList.add('hidden');
        document.getElementById('btnImportBack').classList.add('hidden');
        
        document.getElementById('footerProfiles').classList.remove('hidden');
        document.getElementById('footerItems').classList.add('hidden');
        
        document.getElementById('importModalTitle').textContent = "Importar Perfil";
    };

    window.showProfileItems = (type, id) => {
        const profilesView = document.getElementById('importProfilesView');
        const itemsView = document.getElementById('importItemsView');
        const list = document.getElementById('importItemsList');
        const backBtn = document.getElementById('btnImportBack');
        const title = document.getElementById('importModalTitle');
        
        const footerProfiles = document.getElementById('footerProfiles');
        const footerItems = document.getElementById('footerItems');

        profilesView.classList.add('hidden');
        itemsView.classList.remove('hidden');
        backBtn.classList.remove('hidden');
        
        footerProfiles.classList.add('hidden');
        footerItems.classList.remove('hidden');

        document.getElementById('chkImportAll').checked = true;

        list.innerHTML = '';
        itemsToImport = [];

        let perfil = null;
        let pItems = [];
        let isComment = (type === 'com');

        if (type === 'sup') {
            perfil = window.cachedPerfiles.suplementos.find(p => p.id === id);
            pItems = perfil ? perfil.suplementos : [];
        } else {
            perfil = window.cachedPerfiles.comentarios.find(p => p.id === id);
            pItems = perfil ? perfil.comentarios : [];
        }

        title.textContent = perfil ? perfil.nombre : 'Opciones';

        pItems.forEach((item, idx) => {
            const itemName = isComment ? item.texto : item.nombre;
            const itemPrice = isComment ? null : (item.precio || '0.00');

            const row = document.createElement('div');
            row.className = 'import-item-card';
            row.onclick = (e) => {
                if(e.target.tagName === 'INPUT') return;
                const cb = row.querySelector('.import-checkbox');
                cb.checked = !cb.checked;
                row.classList.toggle('is-selected', cb.checked);
            };
            row.innerHTML = `
                <div class="custom-checkbox-solid">
                    <input type="checkbox" checked data-idx="${idx}" class="import-checkbox" onchange="this.closest('.import-item-card').classList.toggle('is-selected', this.checked)">
                </div>
                <div class="flex-1">
                    <div class="text-sm font-bold" style="color: #fff;">${escapeHtml(itemName)}</div>
                    ${itemPrice !== null ? `<div class="text-tiny text-muted" style="opacity:0.5;">${itemPrice} €</div>` : ''}
                </div>
            `;
            list.appendChild(row);
            row.classList.add('is-selected');
        });
        
        // Guardar referencia temporal para el confirm
        window._currentImportSource = pItems;
        window._currentImportType = type;
    };

    window.toggleSelectAllImport = (checked) => {
        const checkboxes = document.querySelectorAll('.import-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            cb.closest('.import-item-card').classList.toggle('is-selected', checked);
        });
    };

    window.confirmImportItems = () => {
        if (currentImportGroupIdx === null || !window._currentImportSource) return;
        const gIdx = currentImportGroupIdx;
        const type = window._currentImportType;
        const list = document.getElementById('importItemsList');
        const checkboxes = list.querySelectorAll('.import-checkbox');
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                const item = window._currentImportSource[cb.getAttribute('data-idx')];
                const itemName = (type === 'com') ? item.texto : item.nombre;
                const itemPrice = (type === 'com') ? "0.00" : (item.precio || "0.00");

                currentPlantilla.grupos[gIdx].opciones.push({
                    nombre: itemName,
                    precio_base: parseFloat(itemPrice).toFixed(2),
                    visible_comanda: true,
                    visible_factura: true,
                    por_defecto: false,
                    orden: currentPlantilla.grupos[gIdx].opciones.length + 1
                });
            }
        });
        
        closeModal('modalImportProfile');
        renderConfigTemplate();
    };

    // Funciones de ayuda para manipular la estructura currentPlantilla en memoria
    window.addConfigFormat = () => {
        currentPlantilla.formatos.push({ 
            nombre: "Nuevo Formato", 
            factor_precio: 1.0, 
            precio_fijo: null,
            orden: currentPlantilla.formatos.length + 1 
        });
        renderConfigTemplate();
    };
    window.removeFormat = (idx) => { currentPlantilla.formatos.splice(idx, 1); renderConfigTemplate(); };
    window.updateFormat = (idx, key, val) => { currentPlantilla.formatos[idx][key] = val; renderConfigTemplate(); };

    window.addConfigGroup = () => {
        currentPlantilla.grupos.push({ nombre: "Nuevo Grupo", tipo_seleccion: 'UNICA', opciones: [], orden: currentPlantilla.grupos.length + 1 });
        renderConfigTemplate();
    };
    window.removeGroup = (idx) => { currentPlantilla.grupos.splice(idx, 1); renderConfigTemplate(); };
    window.updateGroup = (idx, key, val) => { currentPlantilla.grupos[idx][key] = val; };

    window.addOptionToGroup = (gIdx) => {
        currentPlantilla.grupos[gIdx].opciones.push({ nombre: "Opción", precio_base: "0.00", visible_comanda: true, visible_factura: true, por_defecto: false, orden: currentPlantilla.grupos[gIdx].opciones.length + 1 });
        renderConfigTemplate();
    };
    window.removeOption = (gIdx, oIdx) => { currentPlantilla.grupos[gIdx].opciones.splice(oIdx, 1); renderConfigTemplate(); };
    window.updateOption = (gIdx, oIdx, key, val) => { 
        // Si el grupo es de selección única, y marcamos 'por_defecto' a true, desmarcar el rest
        if (key === 'por_defecto' && val === true) {
            const grupo = currentPlantilla.grupos[gIdx];
            if (grupo.tipo_seleccion === 'UNICA') {
                grupo.opciones.forEach((opt, index) => {
                    if (index !== oIdx) opt.por_defecto = false;
                });
            }
        }
        currentPlantilla.grupos[gIdx].opciones[oIdx][key] = val; 
        renderConfigTemplate(); 
    };
    window.updateOptionFormatPrice = (gIdx, oIdx, fIdx, val) => {
        if (!currentPlantilla.grupos[gIdx].opciones[oIdx].precios_formatos) {
            currentPlantilla.grupos[gIdx].opciones[oIdx].precios_formatos = {};
        }
        currentPlantilla.grupos[gIdx].opciones[oIdx].precios_formatos[fIdx] = val;
    };

    window.saveConfigTemplate = async function() {
        const prodId = document.getElementById('prod_id').value;
        currentPlantilla.tiene_formatos = currentPlantilla.formatos && currentPlantilla.formatos.length > 0;
        
        try {
            const resp = await fetch(`/api/productos/${prodId}/plantilla/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(currentPlantilla)
            });
            if (resp.ok) {
                UI.alert("Plantilla guardada correctamente.");
                closeModal('modalConfigTemplate');
            } else {
                UI.alert("Error al guardar la plantilla.");
            }
        } catch (err) {
            console.error(err);
        }
    };
});
