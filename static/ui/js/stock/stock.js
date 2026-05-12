import {
    escapeHtml,
    formatStockValue,
    getCookie,
    getStateLabel,
    getStepForUnit,
    getStockState,
    getUnitString,
    parseDecimalInput,
} from './utils.js';
import { initPlantillasInventario } from './plantillas.js';

document.addEventListener('DOMContentLoaded', function() {
    const Notify = window.Notify;
    let allArticulos = [];
    let allCategorias = [];
    let allProductos = []; // Para el combo de vinculaciÃ³n
    let allProveedores = [];
    const STOCK_VIEW_STORAGE_KEY = 'tpv.stock.inventory.view';
    let currentView = localStorage.getItem(STOCK_VIEW_STORAGE_KEY) === 'table' ? 'table' : 'cards';
    let currentSort = 'name_asc';
    let currentCat = '';
    let currentStatus = 'all';
    let currentCatName = '';
    let currentStatusName = '';
    let currentSortName = '';
    let inventoryLoaded = false;
    let loadPlantillas = null;

    async function loadData() {
        try {
            const respCat = await fetch('/api/categorias-inventario/');
            if (respCat.ok) {
                allCategorias = await respCat.json();
                renderCatDropdown();
                initFilterControls();
            }

            await fetchProveedores();

            const respArt = await fetch('/api/articulos-inventario/');
            if (respArt.ok) {
                allArticulos = await respArt.json();
                inventoryLoaded = true;
                renderView();
            }
        } catch (err) {
            console.error("Error loading stock data:", err);
            inventoryLoaded = true;
            renderView();
        }
    }

    async function fetchProveedores() {
        try {
            const resp = await fetch('/api/proveedores/');
            if (!resp.ok) return allProveedores;
            const proveedores = await resp.json();
            allProveedores = proveedores
                .filter(p => p.activo !== false)
                .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            renderProveedorSelect();
        } catch (err) {
            console.error("Error loading providers:", err);
        }
        return allProveedores;
    }

    function renderProveedorSelect(selectedId = '') {
        const select = document.getElementById('art_proveedor');
        if (!select) return;
        const value = selectedId || select.value || '';
        const options = allProveedores.map(p => (
            `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`
        )).join('');
        select.innerHTML = `<option value="">Sin proveedor</option>${options}`;
        select.value = value;
    }

    function initSortControl() {
        const labels = {
            name_asc: 'Nombre A-Z',
            name_desc: 'Nombre Z-A',
            stock_desc: 'Stock mayor',
            stock_asc: 'Stock menor',
            min_desc: 'MÃ­nimo mayor',
            state_priority: 'Prioridad stock',
        };
        if (!labels[currentSort]) currentSort = 'name_asc';

        const input = document.getElementById('filterSort');
        if (input) input.value = currentSort;
        currentSortName = labels[currentSort];

        document.querySelectorAll('#dropdownSort .custom-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.textContent.trim() === labels[currentSort]);
        });
        updateFilterSummary();
    }

    function initFilterControls() {
        const cat = allCategorias.find(c => String(c.id) === String(currentCat));
        selectCat(cat ? String(cat.id) : '', cat ? cat.nombre : 'Todas las CategorÃ­as', false);

        const statusLabels = {
            all: 'Todos',
            order: 'Para pedir',
            review: 'Revisar',
            ok: 'En stock',
            low: 'Stock bajo',
            out: 'Sin stock',
        };
        if (!statusLabels[currentStatus]) currentStatus = 'all';
        selectStatus(currentStatus, statusLabels[currentStatus], false);
    }

    function updateFilterSummary() {
        const catName = currentCatName;
        const statusName = currentStatusName;
        const sortName = currentSortName;
        const active = [catName, statusName].filter(Boolean).length;
        const display = document.getElementById('selectedFilterName');
        if (!display) return;
        const sortActive = sortName && sortName !== 'Nombre A-Z';
        const count = active + (sortActive ? 1 : 0);
        display.innerText = count ? String(count) : '';
        display.classList.toggle('is-visible', count > 0);
    }

    function renderCatDropdown() {
        const dropdown = document.getElementById('dropdownCat');
        let html = '<div class="custom-option is-selected" onclick="selectCat(\'\', \'Todas las CategorÃ­as\')">Todas las CategorÃ­as</div>';
        allCategorias.forEach(c => {
            html += `<div class="custom-option" onclick="selectCat('${c.id}', '${c.nombre}')">${c.nombre}</div>`;
        });
        dropdown.innerHTML = html;

        // TambiÃ©n actualizar el select del modal de nuevo artÃ­culo
        const selectCat = document.getElementById('art_categoria');
        if (selectCat) {
            selectCat.innerHTML = '<option value="">Seleccionar...</option>' +
                allCategorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        }
    }

    // --- Custom Dropdown Logic ---
    window.toggleDropdown = (containerId) => {
        const container = document.getElementById(containerId);
        const isActive = container.classList.contains('is-active');
        document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('is-active'));
        if (!isActive) container.classList.add('is-active');
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-container')) {
            document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('is-active'));
        }
    });

    window.selectCat = (id, nombre, shouldRender = true) => {
        const input = document.getElementById('filterCat');
        input.value = id;
        currentCat = id || '';
        currentCatName = id ? nombre : '';

        const options = document.querySelectorAll('#dropdownCat .custom-option');
        options.forEach(opt => {
            opt.classList.toggle('is-selected', opt.innerText === nombre);
        });

        updateFilterSummary();
        if (shouldRender) renderView();
    };

    window.selectStatus = (id, nombre, shouldRender = true) => {
        const input = document.getElementById('filterStatus');
        input.value = id;
        currentStatus = id || 'all';
        currentStatusName = id === 'all' ? '' : nombre;

        const options = document.querySelectorAll('#dropdownStatus .custom-option');
        options.forEach(opt => {
            opt.classList.toggle('is-selected', opt.innerText === nombre);
        });

        updateFilterSummary();
        if (shouldRender) renderView();
    };

    window.selectSort = (id, nombre) => {
        currentSort = id;

        const input = document.getElementById('filterSort');
        input.value = id;
        currentSortName = nombre;

        document.querySelectorAll('#dropdownSort .custom-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.textContent.trim() === nombre);
        });

        updateFilterSummary();
        renderView();
    };

    window.resetStockFilters = () => {
        selectCat('', 'Todas las CategorÃ­as', false);
        selectStatus('all', 'Todos', false);
        selectSort('name_asc', 'Nombre A-Z');
        document.getElementById('containerFilters').classList.remove('is-active');
    };

    function getFiltered() {
        const searchTerm = document.getElementById('stockSearch').value.toLowerCase();
        const catFilter = document.getElementById('filterCat').value;
        const statusFilter = document.getElementById('filterStatus').value;

        const filtered = allArticulos.filter(a => {
            const matchesSearch = a.nombre.toLowerCase().includes(searchTerm);
            const matchesCat = !catFilter || a.categoria == catFilter;
            const state = getStockState(a);

            let matchesStatus = true;
            if (statusFilter === 'ok') matchesStatus = state === 'ok';
            else if (statusFilter === 'low') matchesStatus = state === 'low';
            else if (statusFilter === 'out') matchesStatus = state === 'out';
            else if (statusFilter === 'review') matchesStatus = state === 'review';
            else if (statusFilter === 'order') matchesStatus = ['review', 'out', 'low'].includes(state);

            return matchesSearch && matchesCat && matchesStatus;
        });

        return sortArticulos(filtered);
    }

    function sortArticulos(items) {
        const stateRank = { review: 0, out: 1, low: 2, ok: 3 };
        const sortId = currentSort || document.getElementById('filterSort')?.value || 'name_asc';
        return [...items].sort((a, b) => {
            const nameA = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
            const stockA = parseFloat(a.stock_actual) || 0;
            const stockB = parseFloat(b.stock_actual) || 0;
            const minA = parseFloat(a.stock_minimo) || 0;
            const minB = parseFloat(b.stock_minimo) || 0;

            if (sortId === 'name_desc') return -nameA;
            if (sortId === 'stock_desc') return (stockB - stockA) || nameA;
            if (sortId === 'stock_asc') return (stockA - stockB) || nameA;
            if (sortId === 'min_desc') return (minB - minA) || nameA;
            if (sortId === 'state_priority') {
                return (stateRank[getStockState(a)] - stateRank[getStockState(b)]) || nameA;
            }
            return nameA;
        });
    }

    // --- View Switch ---
    window.switchView = (view, persist = true) => {
        currentView = view;
        if (persist) localStorage.setItem(STOCK_VIEW_STORAGE_KEY, view);
        document.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        const grid = document.getElementById('stockGrid');
        const table = document.getElementById('stockTableWrap');

        if (view === 'cards') {
            grid.classList.add('active');
            table.classList.remove('active');
        } else {
            grid.classList.remove('active');
            table.classList.add('active');
        }
        renderView();
    };

    function renderView() {
        if (currentView === 'cards') {
            renderStockGrid();
        } else {
            renderStockTable();
        }
    }

    const SVG = {
        plus:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        log:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    };

    function renderStockGrid() {
        const grid = document.getElementById('stockGrid');
        const filtered = getFiltered();

        grid.innerHTML = '';

        if (!inventoryLoaded) {
            grid.innerHTML = `
                <div class="inventory-empty inventory-empty--loading">
                    <div class="inventory-empty__content">
                        <div class="inventory-empty__icon">
                            <img src="/static/ui/img/iconos/package-search.svg" class="svg-icon" alt="">
                        </div>
                        <p class="inventory-empty__title">Cargando inventario...</p>
                    </div>
                </div>
            `;
            return;
        }

        if (allArticulos.length === 0) {
            grid.innerHTML = `
                <div class="inventory-empty">
                    <div class="inventory-empty__content">
                        <div class="inventory-empty__icon">
                            <img src="/static/ui/img/iconos/package-search.svg" class="svg-icon" alt="">
                        </div>
                        <p class="inventory-empty__title">Tu inventario estÃ¡ vacÃ­o</p>
                        <p class="inventory-empty__text">Empieza aÃ±adiendo materias primas, bebidas o usa una plantilla para crear solo lo que quieras controlar.</p>
                        <div class="inventory-empty__actions">
                            <button onclick="openModal('modalPlantillas')" class="btn-fast btn-fast-secondary">Usar plantilla</button>
                            <button onclick="openModal('modalArticulo')" class="btn-fast btn-fast-primary">+ Nuevo artÃ­culo</button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="inventory-empty">
                    <div class="inventory-empty__content">
                        <div class="inventory-empty__icon">
                            <img src="/static/ui/img/iconos/package-search.svg" class="svg-icon" alt="">
                        </div>
                        <p class="inventory-empty__title">No hay coincidencias</p>
                        <p class="inventory-empty__text">Prueba a cambiar la bÃºsqueda, la categorÃ­a o el estado seleccionado.</p>
                    </div>
                </div>
            `;
            return;
        }

        filtered.forEach(a => {
            const sActual = parseFloat(a.stock_actual);
            const sMin = parseFloat(a.stock_minimo);
            const state = getStockState(a);
            const stateLabel = getStateLabel(state);
            const catName = a.categoria_nombre || 'General';
            const safeName = a.nombre.replace(/'/g, "\\'");
            const step = getStepForUnit(a.unidad);
            const minValueText = sMin > 0 ? formatStockValue(sMin) : '--';
            const stockMinClass = sMin > 0 ? '' : ' is-empty';
            const safeCardName = escapeHtml(a.nombre);
            const safeCatName = escapeHtml(catName);

            // Format stock value for display (drop decimal if 0)
            const stockDisplay = formatStockValue(sActual);
            const autoHtml = (a.auto_descontar && a.producto_vinculado_nombre)
                ? `<div class="stock-auto-pill" title="Descuento automatico activado">Auto: ${escapeHtml(a.producto_vinculado_nombre)}</div>`
                : '<div class="stock-auto-pill stock-auto-pill--ghost" aria-hidden="true">Auto TPV</div>';
            const providerHtml = a.proveedor_nombre
                ? `<div class="stock-provider-pill" title="Proveedor">${escapeHtml(a.proveedor_nombre)}</div>`
                : '';

            const card = document.createElement('div');
            card.className = `product-card state-${state} animated fadeIn`;
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-name" title="${safeCardName}">${safeCardName}</span>
                </div>
                <div class="card-dept-row">
                    <div class="card-dept">${safeCatName}</div>
                    <span class="card-price">#${a.id}</span>
                </div>
                <div class="card-auto-slot">${providerHtml}${autoHtml}</div>

                <button type="button" class="stock-hero" onclick="openAjuste(${a.id}, '${safeName}', ${sActual})" title="Ajustar stock">
                    <span class="stock-hero-kicker">Stock actual</span>
                    <div class="stock-hero-main">
                        <span class="stock-hero-value val-${state}">${stockDisplay}</span>
                        <span class="stock-hero-unit">${getUnitString(a.unidad)}</span>
                    </div>
                    <div class="stock-hero-foot">
                        <span class="stock-badge badge-${state}">
                            <span class="badge-dot"></span>
                            ${stateLabel}
                        </span>
                        <span class="stock-hero-min${stockMinClass}">Min. <span class="min-value">${minValueText}</span></span>
                    </div>
                </button>

                <div class="card-controls">
                    <div class="stepper">
                        <button class="stepper-btn s-sub" onclick="quickAdjust(${a.id}, ${sActual}, -${step})" title="Salida rapida ${step}">
                            ${SVG.minus}
                        </button>
                        <span class="stepper-value" id="stepper-${a.id}">${stockDisplay}</span>
                        <button class="stepper-btn s-add" onclick="quickAdjust(${a.id}, ${sActual}, ${step})" title="Entrada rapida ${step}">
                            ${SVG.plus}
                        </button>
                    </div>
                    <div class="card-actions">
                        <button class="ctrl-btn ctrl-log" onclick="viewHistory(${a.id})" title="Historial">
                            ${SVG.log}
                            <span>Hist.</span>
                        </button>
                        <button class="ctrl-btn ctrl-cfg" onclick="editArticulo(${a.id})" title="Editar articulo">
                            ${SVG.gear}
                            <span>Editar</span>
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function renderStockTable() {
        const tbody = document.getElementById('stockTableBody');
        const filtered = getFiltered();

        tbody.innerHTML = '';
        if (!inventoryLoaded) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="table-empty-cell">
                        <div class="inventory-empty inventory-empty--table inventory-empty--loading">
                            <div class="inventory-empty__content">
                                <div class="inventory-empty__icon">
                                    <img src="/static/ui/img/iconos/package-search.svg" class="svg-icon" alt="">
                                </div>
                                <p class="inventory-empty__title">Cargando inventario...</p>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        if (filtered.length === 0) {
            const isInventoryEmpty = allArticulos.length === 0;
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty-cell">
                        <div class="inventory-empty inventory-empty--table">
                            <div class="inventory-empty__content">
                                <div class="inventory-empty__icon">
                                    <img src="/static/ui/img/iconos/package-search.svg" class="svg-icon" alt="">
                                </div>
                                <p class="inventory-empty__title">${isInventoryEmpty ? 'Tu inventario estÃ¡ vacÃ­o' : 'No hay coincidencias'}</p>
                                <p class="inventory-empty__text">
                                    ${isInventoryEmpty
                                        ? 'Empieza aÃ±adiendo materias primas, bebidas o usa una plantilla para crear solo lo que quieras controlar.'
                                        : 'Prueba a cambiar la bÃºsqueda, la categorÃ­a o el estado seleccionado.'}
                                </p>
                                ${isInventoryEmpty ? `
                                    <div class="inventory-empty__actions">
                                        <button onclick="openModal('modalPlantillas')" class="btn-fast btn-fast-secondary">Usar plantilla</button>
                                        <button onclick="openModal('modalArticulo')" class="btn-fast btn-fast-primary">+ Nuevo artÃ­culo</button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(a => {
            const sActual = parseFloat(a.stock_actual);
            const state = getStockState(a);
            const catName = a.categoria_nombre || 'General';
            const step = getStepForUnit(a.unidad);

            const stockDisplay = formatStockValue(sActual);
            const minDisplay = formatStockValue(a.stock_minimo);
            const valClass = { ok: 'text-emerald-400', low: 'text-amber-400', out: 'text-rose-400', review: 'text-rose-300' }[state];
            const autoLabel = (a.auto_descontar && a.producto_vinculado_nombre) ? a.producto_vinculado_nombre : '-';
            const providerLabel = a.proveedor_nombre || '-';

            const tr = document.createElement('tr');
            tr.className = `row-${state}`;
            tr.innerHTML = `
                <td class="td-product">${escapeHtml(a.nombre)}</td>
                <td><span class="card-dept card-dept--table">${escapeHtml(catName)}</span></td>
                <td>
                    <span class="stock-badge badge-${state}">
                        <span class="badge-dot"></span>
                        ${getStateLabel(state)}
                    </span>
                </td>
                <td class="td-stock ${valClass}">${stockDisplay}</td>
                <td class="td-unit">${getUnitString(a.unidad)}</td>
                <td class="td-min">${minDisplay}</td>
                <td class="td-provider" title="${escapeHtml(providerLabel)}">${escapeHtml(providerLabel)}</td>
                <td class="td-auto" title="${escapeHtml(autoLabel)}">${escapeHtml(autoLabel)}</td>
                <td>
                    <div class="td-actions">
                        <button class="tbl-btn tbl-add" onclick="quickAdjust(${a.id}, ${sActual}, ${step})">+${step}</button>
                        <button class="tbl-btn tbl-sub" onclick="quickAdjust(${a.id}, ${sActual}, -${step})">-${step}</button>
                        <button class="tbl-btn tbl-log" onclick="viewHistory(${a.id})">Log</button>
                        <button class="tbl-btn" onclick="editArticulo(${a.id})">Editar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.openModal = (id) => {
        if (id === 'modalPlantillas') loadPlantillas();
        if (id === 'modalArticulo') {
            // Reset fields
            document.getElementById('ajuste_art_id').value = '';
            document.getElementById('art_nombre').value = '';
            document.getElementById('art_categoria').value = '';
            document.getElementById('art_unidad').value = 'ud';
            document.getElementById('art_proveedor').value = '';
            document.getElementById('art_stock').value = '0';
            document.getElementById('art_minimo').value = '0';
            document.getElementById('modalArtTitle').innerText = 'Nuevo ArtÃ­culo';

            document.getElementById('art_auto_desc').checked = false;
            document.getElementById('art_producto_vinculado').value = '';
            toggleAutoDesc();
            fetchProveedores();
            fetchProductosBase();
        }
        document.getElementById(id).classList.remove('hidden');
    };

    window.closeModal = (id) => {
        document.getElementById(id).classList.add('hidden');
    };

    ({ loadPlantillas } = initPlantillasInventario({
        Notify,
        fetchProductosBase,
        loadData,
        closeModal: window.closeModal,
    }));

    window.openProveedoresManager = () => {
        window.location.href = '../proveedores/';
    };

    window.toggleAutoDesc = () => {
        const checked = document.getElementById('art_auto_desc').checked;
        const optContainer = document.getElementById('vinculo_opciones');
        const help = document.getElementById('vinculo_help');
        if (checked) {
            optContainer.classList.remove('hidden');
            help.style.display = 'block';
        } else {
            optContainer.classList.add('hidden');
            help.style.display = 'none';
        }
    };

    async function fetchProductosBase() {
        if (allProductos.length > 0) return allProductos;
        try {
            const res = await fetch('/api/productos/');
            if (res.ok) {
                const productos = await res.json();
                allProductos = productos
                    .filter(p => p.eliminado !== true)
                    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
                const sel = document.getElementById('art_producto_vinculado');
                let html = '<option value="">Producto TPV opcional...</option>';
                allProductos.forEach(p => {
                    const estado = p.activo === false ? ' (inactivo)' : '';
                    html += `<option value="${p.id}">${p.nombre}${estado}</option>`;
                });
                sel.innerHTML = html;
            }
        } catch (e) { console.error(e); }
        return allProductos;
    }

    window.guardarArticulo = async () => {
        const id = document.getElementById('ajuste_art_id').value;
        const autoDescontar = document.getElementById('art_auto_desc').checked;
        const productoVinculado = autoDescontar ? (document.getElementById('art_producto_vinculado').value || null) : null;
        const data = {
            nombre: document.getElementById('art_nombre').value,
            categoria_id: document.getElementById('art_categoria').value || null,
            unidad: document.getElementById('art_unidad').value,
            stock_actual: document.getElementById('art_stock').value.replace(',', '.'),
            stock_minimo: document.getElementById('art_minimo').value.replace(',', '.'),
            proveedor_id: document.getElementById('art_proveedor').value || null,
            auto_descontar: autoDescontar,
            producto_vinculado_id: productoVinculado,
            cantidad_por_venta: 1
        };

        if (!data.nombre) {
      Notify.info('El nombre es obligatorio');
            return;
        }

        if (autoDescontar && !productoVinculado) {
      Notify.info('Elige un producto TPV para activar el descuento automatico.');
            return;
        }

        try {
            const url = id ? `/api/articulos-inventario/${id}/` : '/api/articulos-inventario/';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                closeModal('modalArticulo');
                loadData();
            } else {
                const err = await res.json().catch(() => null);
                const firstError = err && typeof err === 'object'
                    ? Object.values(err).flat().join('\n')
                    : null;
        Notify.error(firstError || "Error guardando el articulo.");
            }
        } catch (e) { console.error(e); }
    };

    window.editArticulo = (id) => {
        const art = allArticulos.find(a => a.id === id);
        if (!art) return;

        Promise.all([fetchProductosBase(), fetchProveedores()]).then(() => {
            document.getElementById('ajuste_art_id').value = art.id;
            document.getElementById('art_nombre').value = art.nombre;
            document.getElementById('art_categoria').value = art.categoria || '';
            document.getElementById('art_unidad').value = art.unidad;
            renderProveedorSelect(art.proveedor_ref || '');
            document.getElementById('art_stock').value = art.stock_actual;
            document.getElementById('art_minimo').value = art.stock_minimo;

            document.getElementById('art_auto_desc').checked = art.auto_descontar;
            toggleAutoDesc();
            document.getElementById('art_producto_vinculado').value = art.producto_vinculado || '';

            document.getElementById('modalArtTitle').innerText = 'Editar ArtÃ­culo';
            document.getElementById('modalArticulo').classList.remove('hidden');
        });
    };

    window.quickAdjust = async (id, actual, delta) => {
        const stepperEl = document.getElementById(`stepper-${id}`);
        const newVal = actual + delta;
        if (stepperEl) {
            stepperEl.textContent = newVal % 1 === 0 ? newVal.toString() : newVal.toFixed(2);
            stepperEl.style.color = delta > 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
            stepperEl.classList.add('flash');
            setTimeout(() => { stepperEl.style.color = ''; stepperEl.classList.remove('flash'); }, 400);
        }

        try {
            const resp = await fetch(`/api/articulos-inventario/${id}/ajustar/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({
                    cantidad: delta,
                    tipo: delta > 0 ? 'entrada' : 'salida',
                    motivo: delta > 0 ? 'Entrada rapida' : 'Salida rapida'
                })
            });
            if (resp.ok) loadData();
        } catch (err) { console.error(err); }
    };

    // Modal Ajuste Manual (Abre el modal existente)
    window.openAjuste = (id, nombre, actual) => {
        document.getElementById('ajuste_prod_id').value = id;
        document.getElementById('ajuste_prod_nombre').innerText = nombre;
        document.getElementById('ajuste_stock_actual').innerText = formatStockValue(actual);
        document.getElementById('ajuste_cantidad').value = '0';
        document.getElementById('ajuste_motivo').value = '';
        selectAjusteTipo('entrada', 'Entrada');
        document.getElementById('modalAjuste').classList.remove('hidden');
    };

    window.saveAjuste = async () => {
        const id = document.getElementById('ajuste_prod_id').value;
        const cantidad = parseDecimalInput(document.getElementById('ajuste_cantidad').value);
        const tipo = document.getElementById('ajuste_tipo').value;
        const motivo = document.getElementById('ajuste_motivo').value;

        if (isNaN(cantidad) || (tipo !== 'recuento' && cantidad <= 0)) return;

        const payload = { motivo };
        if (tipo === 'recuento') {
            payload.operacion = 'recuento';
            payload.stock_final = cantidad;
        } else {
            payload.operacion = 'delta';
            payload.tipo = tipo;
            payload.cantidad = tipo === 'salida' ? -Math.abs(cantidad) : Math.abs(cantidad);
        }

        try {
            const resp = await fetch(`/api/articulos-inventario/${id}/ajustar/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                closeModal('modalAjuste');
                loadData();
            } else {
                const err = await resp.json().catch(() => null);
      Notify.error((err && (err.error || Object.values(err).flat().join('\n'))) || 'No se pudo guardar el movimiento.');
            }
        } catch (err) { console.error(err); }
    };

    window.viewHistory = async (id) => {
        const list = document.getElementById('movHistoryList');
        list.innerHTML = `<div class="p-10 text-center opacity-50">Cargando bitÃ¡cora...</div>`;
        document.getElementById('modalHistorial').classList.remove('hidden');

        try {
            const resp = await fetch(`/api/articulos-inventario/${id}/historial/`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.length === 0) {
                    list.innerHTML = '<div class="p-10 text-center text-slate-500">No hay registros histÃ³ricos.</div>';
                    return;
                }
                list.innerHTML = '';
                data.forEach(m => {
                    const fecha = new Date(m.fecha).toLocaleString();
                    const anterior = parseFloat(m.anterior);
                    const nuevo = parseFloat(m.nuevo);
                    const delta = (!isNaN(anterior) && !isNaN(nuevo)) ? (nuevo - anterior) : parseFloat(m.cantidad);
                    const valReal = Math.abs(delta);
                    let color = '#94a3b8';
                    let sign = delta > 0 ? '+' : '-';
                    if (delta > 0) color = '#10b981';
                    else if (delta < 0) color = m.tipo === 'venta' ? '#f59e0b' : '#f43f5e';
                    else sign = '';

                    list.innerHTML += `
                        <div class="flex items-center gap-4 p-4 border-b border-white/5">
                            <div class="flex-1">
                                <div class="flex justify-between mb-1">
                                    <span class="font-bold text-sm" style="color: ${color}">${m.tipo.toUpperCase()}</span>
                                    <span class="text-xs text-slate-500">${fecha}</span>
                                </div>
                                <div class="text-xs text-slate-400">${m.motivo || '-'}</div>
                                <div class="text-[0.65rem] text-slate-600 mt-1">De ${formatStockValue(m.anterior)} a ${formatStockValue(m.nuevo)}</div>
                            </div>
                            <div class="text-right text-lg font-black" style="color: ${color}">
                                ${sign}${formatStockValue(valReal)}
                            </div>
                        </div>
                    `;
                });
            }
        } catch (err) { list.innerHTML = '<div class="text-center text-rose-500">Error</div>'; }
    };

    window.selectAjusteTipo = (id, nombre) => {
        document.getElementById('ajuste_tipo').value = id;
        document.getElementById('selectedAjusteTipoName').innerText = nombre;
        document.querySelectorAll('#containerAjusteTipo .custom-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.textContent.trim() === nombre);
        });
        document.getElementById('containerAjusteTipo').classList.remove('is-active');
    };

    window.filterStock = renderView;

    switchView(currentView, false);
    initSortControl();
    loadData();
});
