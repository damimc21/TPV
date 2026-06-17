import { initManualTools } from './manual_tools.js';
import {
    loadComentarios as apiLoadComentarios,
    loadDepartamentosProductos as apiLoadDepartamentosProductos,
    loadModificadoresData,
    loadPerfilesComentarios as apiLoadPerfilesComentarios,
    loadPerfilesSuplementos as apiLoadPerfilesSuplementos,
    loadSuplementos as apiLoadSuplementos,
} from './api.js';
import {
    csrfHeaders,
    escapeHtml,
    getCsrfToken,
    jsonHeaders,
} from './utils.js';

/**
 * modificadores.js
 * Script para manejar la vista SPA de Modificadores (Comentarios + Suplementos + Perfiles)
 */

function initModificadoresApp() {
    // Referencias a elementos UI
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');
    const btnNuevoPerfil = document.getElementById('btnNuevoPerfil');
    const btnNuevoGeneral = document.getElementById('btnNuevoGeneral');
    const btnComodin = document.getElementById('btnComodin');
    const btnComentarioLibre = document.getElementById('btnComentarioLibre');
    const subtabBtns = document.querySelectorAll('.subtab-btn');

    // Estado
    let hash = window.location.hash ? window.location.hash.substring(1) : '';
    let activeTab = (hash === 'comentarios' || hash === 'suplementos') ? hash : 'comentarios';

    let searchString = '';
    let sortField = 'id';
    let sortDir = 'asc';
    let filterPerfilId = '';
    let filterPrimaryValue = '';
    let filterSecondaryValue = '';
    let activeSubTab = 'comentarios-perfiles';

    // Cachés
    let perfilesComentariosData = [];
    let comentariosData = [];
    let perfilesSuplementosData = [];
    let suplementosData = [];
    let departamentosData = [];
    let productosData = [];

    // Configuración
    initTabs();
    initSubTabs();
    initFilters();
    initModals();

    // Cargar datos inicialmente (Batch)
    loadInitialData();

    async function loadInitialData() {
        try {
            const data = await loadModificadoresData();
            departamentosData = data.departamentos;
            productosData = data.productos;
            perfilesComentariosData = data.perfilesComentarios;
            comentariosData = data.comentarios;
            perfilesSuplementosData = data.perfilesSuplementos;
            suplementosData = data.suplementos;

            // Una única actualización y renderizado inicial
            updateFiltersForSubTab();
            updateGeneralButtonsState();
            renderAll();
        } catch (err) {
            console.error('Error en carga inicial:', err);
        }
    }

    // ==========================================
    // TABS
    // ==========================================
    function initTabs() {
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

        // Al cambiar de pestaña principal, nos aseguramos que se vea la subpestaña por defecto
        const defaultSubTabId = targetId === 'comentarios' ? 'comentarios-perfiles' : 'suplementos-perfiles';
        activateSubTab(defaultSubTabId);

        // Actualizar UI según la nueva pestaña
        updateGeneralButtonsState();

        // Flicker fix: reveal UI
        if (skipAnimation) {
            const app = document.querySelector('.catalogo-app');
            if (app) app.classList.remove('is-resolving');
        }
    }

    // ==========================================
    // SUB-TABS (Navegación interna)
    // ==========================================
    function initSubTabs() {
        subtabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const subtabId = btn.getAttribute('data-subtab');
                activateSubTab(subtabId);
            });
        });
    }

    function activateSubTab(subtabId) {
        activeSubTab = subtabId;

        // Marcamos botón como activo (solo los de la vista actual)
        const currentView = document.getElementById(`view-${activeTab}`);
        if (currentView) {
            currentView.querySelectorAll('.subtab-btn').forEach(btn => {
                btn.classList.toggle('is-active', btn.getAttribute('data-subtab') === subtabId);
            });
        }

        // Mostramos la sub-vista correspondiente
        const subviews = document.querySelectorAll('.sub-view');
        subviews.forEach(sv => {
            if (sv.id === `subview-${subtabId}`) {
                sv.classList.remove('hidden');
            } else {
                sv.classList.add('hidden');
            }
        });

        // Actualizar visibilidad de botones en la cabecera
        const isPerfiles = subtabId.endsWith('-perfiles');

        const newPerfilText = activeTab === 'comentarios' 
            ? `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Perfil Comentarios` 
            : `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Perfil Suplementos`;
        const newGeneralText = activeTab === 'comentarios' 
            ? `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Comentario` 
            : `<img src="/static/ui/img/iconos/plus.svg" alt=""> Nuevo Suplemento`;

        if (btnNuevoPerfil && btnNuevoPerfil.innerHTML.trim() !== newPerfilText.trim()) {
            btnNuevoPerfil.innerHTML = newPerfilText;
        }
        if (btnNuevoGeneral && btnNuevoGeneral.innerHTML.trim() !== newGeneralText.trim()) {
            btnNuevoGeneral.innerHTML = newGeneralText;
        }

        // Visibilidad dinámica
        if (isPerfiles) {
            btnNuevoPerfil.classList.remove('hidden');
            btnNuevoGeneral.classList.add('hidden');
            if (btnComodin) btnComodin.classList.add('hidden');
            if (btnComentarioLibre) btnComentarioLibre.classList.add('hidden');
        } else {
            btnNuevoPerfil.classList.add('hidden');
            btnNuevoGeneral.classList.remove('hidden');
            if (btnComodin) {
                btnComodin.classList.toggle('hidden', activeTab !== 'suplementos');
            }
            if (btnComentarioLibre) {
                btnComentarioLibre.classList.toggle('hidden', activeTab !== 'comentarios');
            }
        }

        updateFiltersForSubTab();
        updateGeneralButtonsState();
    }

    function updateGeneralButtonsState() {
        if (!btnNuevoGeneral) return;
        if (activeTab === 'comentarios') {
            btnNuevoGeneral.disabled = (perfilesComentariosData.length === 0);
        } else {
            btnNuevoGeneral.disabled = (perfilesSuplementosData.length === 0);
        }
    }

    // ==========================================
    // FILTROS
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
        const sortDirBtn = document.getElementById('sortDirBtn');

        initCustomSelect('customFilterPrimary', syncAndRender);
        initCustomSelect('customFilterSecondary', syncAndRender);
        initCustomSelect('customSortField', syncAndRender);

        searchInput.addEventListener('input', () => { syncAndRender(); });
        searchInput.addEventListener('keyup', () => { syncAndRender(); });

        // Popover de Filtros
        const btnToggleFilters = document.getElementById('btnToggleFilters');
        const filterPopover = document.getElementById('filterPopover');
        const btnClearFilters = document.getElementById('btnClearFilters');

        if (btnToggleFilters && filterPopover) {
            btnToggleFilters.addEventListener('click', (e) => {
                e.stopPropagation();
                filterPopover.classList.toggle('is-active');
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
                if (!e.target.closest('.custom-select')) {
                    document.querySelectorAll('.custom-select').forEach(cs => cs.classList.remove('is-active'));
                }
            });

            filterPopover.addEventListener('click', (e) => e.stopPropagation());
        }

        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => {
                searchInput.value = '';
                setCustomSelectValue('customFilterPrimary', '', 'Todos');
                setCustomSelectValue('customFilterSecondary', '', 'Todos');
                setCustomSelectValue('customSortField', 'id', 'ID');
                sortDir = 'asc';
                updateSortDirUI();
                syncAndRender();
                filterPopover.classList.remove('is-active');
            });
        }

        updateSortDirUI();

        sortDirBtn.addEventListener('click', () => {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            updateSortDirUI();
            syncAndRender();
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
        searchString = (document.getElementById('searchInput').value || '').toLowerCase();
        sortField = getCustomSelectValue('customSortField') || 'id';
        filterPrimaryValue = getCustomSelectValue('customFilterPrimary') || '';
        filterSecondaryValue = getCustomSelectValue('customFilterSecondary') || '';
        filterPerfilId = activeSubTab.endsWith('-lista') ? filterPrimaryValue : '';
    }

    function syncAndRender() {
        syncFilterState();
        renderAll();
    }

    function renderAll() {
        if (activeTab === 'comentarios') {
            renderPerfilesComentarios();
            renderComentarios();
        } else {
            renderPerfilesSuplementos();
            renderSuplementos();
        }
    }

    function applySorting(array) {
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...array].sort((a, b) => {
            if (sortField === 'id') return (a.id - b.id) * dir;
            if (sortField === 'nombre') {
                const nameA = a.nombre || a.texto || '';
                const nameB = b.nombre || b.texto || '';
                return nameA.localeCompare(nameB) * dir;
            }
            if (sortField === 'num_items') {
                const countA = (a.comentarios || a.suplementos || []).length;
                const countB = (b.comentarios || b.suplementos || []).length;
                return (countA - countB) * dir;
            }
            if (sortField === 'activo') {
                return ((a.activo === b.activo) ? 0 : a.activo ? -1 : 1) * dir;
            }
            if (sortField === 'perfil') {
                const perfilesData = activeTab === 'comentarios' ? perfilesComentariosData : perfilesSuplementosData;
                const pA = perfilesData.find(p => p.id === a.perfil);
                const pB = perfilesData.find(p => p.id === b.perfil);
                const nA = pA ? pA.nombre : '';
                const nB = pB ? pB.nombre : '';
                return nA.localeCompare(nB) * dir;
            }
            return 0;
        });
    }

    // ==========================================
    // FILTROS DINÁMICOS POR SUB-PESTAÑA
    // ==========================================
    // ==========================================
    // MODALES
    // ==========================================
    function initModals() {
        // Botones "Nuevo Perfil"
        btnNuevoPerfil.addEventListener('click', () => {
            if (activeTab === 'comentarios') {
                openModalPerfilComentario();
            } else {
                openModalPerfilSuplemento();
            }
        });

        // Botones "Nuevo Comentario/Suplemento" (General)
        btnNuevoGeneral.addEventListener('click', () => {
            if (activeTab === 'comentarios') {
                openModalComentario();
            } else {
                openModalSuplemento();
            }
        });

        if (btnComodin) {
            btnComodin.addEventListener('click', () => {
                openModalHerramientas('sup');
            });
        }

        if (btnComentarioLibre) {
            btnComentarioLibre.addEventListener('click', () => {
                openModalHerramientas('com');
            });
        }

        // Botones Guardar
        document.getElementById('btnGuardarPerfilComentario').addEventListener('click', savePerfilComentario);
        document.getElementById('btnGuardarComentario').addEventListener('click', saveComentario);
        document.getElementById('btnGuardarPerfilSuplemento').addEventListener('click', savePerfilSuplemento);
        document.getElementById('btnGuardarSuplemento').addEventListener('click', saveSuplemento);
    }

    window.closeModal = function (modalId) {
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.add('hidden');
        }
    };

    // ==========================================
    // DIÁLOGOS UNIVERSALES (Alert/Confirm)
    // ==========================================
const UI = window.UI;
const Notify = window.Notify;

    function openModalById(modalId) {
        const m = document.getElementById(modalId);
        if (m) {
            m.classList.remove('hidden');
        }
    }

    // ==========================================
    // DATOS AUXILIARES (Deptos y Productos para multi-select)
    // ==========================================
    async function loadDepartamentosProductos() {
        try {
            [departamentosData, productosData] = await apiLoadDepartamentosProductos();
        } catch (err) {
            console.error('Error cargando deptos/productos:', err);
        }
    }

    function populateMultiSelect(containerId, items, selectedIds) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const selectedSet = new Set(selectedIds || []);

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'selectable-item';
            if (selectedSet.has(item.id)) el.classList.add('is-selected');
            el.dataset.id = item.id;
            el.textContent = item.nombre;

            el.addEventListener('click', () => {
                el.classList.toggle('is-selected');
            });

            container.appendChild(el);
        });
    }

    function getMultiSelectValues(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('.selectable-item.is-selected'))
            .map(el => parseInt(el.dataset.id));
    }

    // ==========================================
    // PERFILES DE COMENTARIOS
    // ==========================================
    async function loadPerfilesComentarios() {
        try {
            perfilesComentariosData = await apiLoadPerfilesComentarios();
            if (activeTab === 'comentarios') {
                renderPerfilesComentarios();
                updateFiltersForSubTab();
                updatePerfilComentarioSelects();
            }
            updateGeneralButtonsState();
        } catch (err) { console.error(err); }
    }

    function renderPerfilesComentarios() {
        const tbody = document.getElementById('tbody-perfiles-comentarios');
        tbody.innerHTML = '';
        syncFilterState();

        let filtered = perfilesComentariosData.filter(p => {
            // Filtrar por departamento (filterPrimaryValue) cuando estamos en sub-vista perfiles
            if (filterPrimaryValue && activeSubTab === 'comentarios-perfiles') {
                const deptoId = parseInt(filterPrimaryValue);
                if (!(p.departamentos_ids || []).includes(deptoId)) return false;
            }
            if (searchString) {
                return String(p.id).includes(searchString) || p.nombre.toLowerCase().includes(searchString);
            }
            return true;
        });
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No se encontraron perfiles.</td></tr>';
            return;
        }

        filtered.forEach((p, index) => {
            const statusHtml = p.activo
                ? '<span class="status-badge active">ACTIVO</span>'
                : '<span class="status-badge inactive">INACTIVO</span>';
            const numComentarios = p.comentarios ? p.comentarios.length : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${p.id}</td>
                <td class="font-weight-bold">${escapeHtml(p.nombre)}</td>
                <td class="text-center">${numComentarios}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar (${p.id})" onclick="editPerfilComentario(${p.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn" title="Añadir Comentario" onclick="openModalComentarioForPerfil(${p.id})">
                        <img src="/static/ui/img/iconos/message-circle-more.svg" alt="Añadir">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deletePerfilComentario(${p.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updatePerfilComentarioSelects() {
        const select = document.getElementById('comentario_perfil');
        if (!select) return;
        const transSelect = document.getElementById('js-translations')?.dataset.seleccionar || 'Seleccionar';
        select.innerHTML = `<option value="">${transSelect}</option>`;
        perfilesComentariosData.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre;
            select.appendChild(opt);
        });
    }

    function openModalPerfilComentario() {
        document.getElementById('formPerfilComentario').reset();
        document.getElementById('perfil_comentario_id').value = '';
        document.getElementById('modalPerfilComentarioTitle').innerText = 'Nuevo Perfil de Comentarios';
        document.getElementById('perfil_comentario_activo').checked = true;
        populateMultiSelect('perfil_comentario_deptos', departamentosData, []);
        populateMultiSelect('perfil_comentario_prods', productosData, []);
        document.getElementById('modalPerfilComentario').classList.remove('hidden');
    }

    window.editPerfilComentario = function (id) {
        const p = perfilesComentariosData.find(x => x.id === id);
        if (!p) return;
        document.getElementById('perfil_comentario_id').value = p.id;
        document.getElementById('perfil_comentario_nombre').value = p.nombre;
        document.getElementById('perfil_comentario_activo').checked = p.activo;
        document.getElementById('modalPerfilComentarioTitle').innerText = 'Editar Perfil de Comentarios';
        populateMultiSelect('perfil_comentario_deptos', departamentosData, p.departamentos_ids || []);
        populateMultiSelect('perfil_comentario_prods', productosData, p.productos_ids || []);
        document.getElementById('modalPerfilComentario').classList.remove('hidden');
    };

    async function savePerfilComentario() {
        const id = document.getElementById('perfil_comentario_id').value;
        const payload = {
            nombre: document.getElementById('perfil_comentario_nombre').value.trim(),
            activo: document.getElementById('perfil_comentario_activo').checked,
            departamentos_ids: getMultiSelectValues('perfil_comentario_deptos'),
            productos_ids: getMultiSelectValues('perfil_comentario_prods'),
        };
        if (!payload.nombre) return Notify.info('El nombre es obligatorio.');

        const url = id ? `/api/perfiles-comentarios/${id}/` : '/api/perfiles-comentarios/';
        const method = id ? 'PUT' : 'POST';

        try {
            const resp = await fetch(url, {
                method, headers: jsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Error al guardar');
            closeModal('modalPerfilComentario');
            loadPerfilesComentarios();
        } catch (err) { Notify.error('Error: ' + err.message); }
    }

    window.deletePerfilComentario = async function (id) {
        const p = perfilesComentariosData.find(item => item.id == id);
        const count = p && p.comentarios ? p.comentarios.length : 0;
        
        if (count > 0) {
            const listHtml = p.comentarios.map(c => `<li>${escapeHtml(c.texto)}</li>`).join('');
            return UI.dialog({
                title: 'Perfil con contenido',
                message: `
                    <p class="mb-3">El perfil <strong>"${escapeHtml(p.nombre)}"</strong> tiene <strong>${count}</strong> comentarios activos y no puede eliminarse.</p>
                    <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.15); padding: 8px 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; text-align: left;">
                        <ul style="margin: 0; padding-left: 18px; color: var(--text); opacity: 0.9; font-size: 0.9rem;">
                            ${listHtml}
                        </ul>
                    </div>
                `,
                type: 'lock',
                confirmText: 'Entendido',
                showCancel: false
            });
        }

        const confirmed = await Notify.confirmDanger('¿Deseas eliminar este perfil de comentarios?', {
            title: 'Eliminar Perfil',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await fetch(`/api/perfiles-comentarios/${id}/`, {
                method: 'DELETE', headers: csrfHeaders()
            });
            loadPerfilesComentarios();
            loadComentarios();
        } catch (err) { Notify.error('Error al eliminar.'); }
    };

    // ==========================================
    // COMENTARIOS
    // ==========================================
    async function loadComentarios() {
        try {
            comentariosData = await apiLoadComentarios();
            if (activeTab === 'comentarios') renderComentarios();
        } catch (err) { console.error(err); }
    }

    function renderComentarios() {
        const tbody = document.getElementById('tbody-comentarios');
        tbody.innerHTML = '';
        syncFilterState();

        let filtered = comentariosData.filter(c => {
            if (filterPerfilId && c.perfil != filterPerfilId) return false;
            // Filtrar por producto (filterSecondaryValue)
            if (filterSecondaryValue) {
                const prodId = parseInt(filterSecondaryValue);
                const perfilObj = perfilesComentariosData.find(p => p.id === c.perfil);
                if (!perfilObj || !(perfilObj.productos_ids || []).includes(prodId)) return false;
            }
            if (searchString) {
                return String(c.id).includes(searchString) || c.texto.toLowerCase().includes(searchString);
            }
            return true;
        });
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No se encontraron comentarios.</td></tr>';
            return;
        }

        filtered.forEach((c, index) => {
            const statusHtml = c.activo
                ? '<span class="status-badge active">ACTIVO</span>'
                : '<span class="status-badge inactive">INACTIVO</span>';
            const perfilObj = perfilesComentariosData.find(p => p.id === c.perfil);
            const perfilNombre = perfilObj ? escapeHtml(perfilObj.nombre) : '<span class="text-muted">Sin perfil</span>';

            let displayTexto = escapeHtml(c.texto);
            let badgeHtml = '';
            if (c.texto === '__MANUAL_TEXT__') {
                displayTexto = '<span style="color: #64ffda;">Comentario libre</span>';
                badgeHtml = '<span class="badge-special ml-2">HERRAMIENTA</span>';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${c.id}</td>
                <td class="font-weight-bold">
                    <div class="flex items-center gap-2">
                        ${displayTexto}
                        ${badgeHtml}
                    </div>
                </td>
                <td>${perfilNombre}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar (${c.id})" onclick="editComentario(${c.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deleteComentario(${c.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.openModalComentarioForPerfil = function (perfilId) {
        document.getElementById('formComentario').reset();
        document.getElementById('comentario_id').value = '';
        document.getElementById('comentario_perfil').value = perfilId;
        document.getElementById('comentario_activo').checked = true;
        document.getElementById('modalComentarioTitle').innerText = 'Nuevo Comentario';
        document.getElementById('modalComentario').classList.remove('hidden');
        // Ocultar selector de perfil si viene de un perfil específico
        document.getElementById('comentario_perfil_container').classList.add('hidden');
    };

    window.openModalComentario = function () {
        document.getElementById('formComentario').reset();
        document.getElementById('comentario_id').value = '';
        document.getElementById('comentario_activo').checked = true;
        document.getElementById('modalComentarioTitle').innerText = 'Nuevo Comentario';
        document.getElementById('modalComentario').classList.remove('hidden');
        // Mostrar selector de perfil
        updatePerfilComentarioSelects();
        document.getElementById('comentario_perfil_container').classList.remove('hidden');
    };

    window.editComentario = function (id) {
        const c = comentariosData.find(x => x.id === id);
        if (!c) return;
        document.getElementById('comentario_id').value = c.id;
        document.getElementById('comentario_texto').value = c.texto;
        updatePerfilComentarioSelects();
        document.getElementById('comentario_perfil').value = c.perfil || '';
        document.getElementById('comentario_activo').checked = c.activo;
        document.getElementById('modalComentarioTitle').innerText = 'Editar Comentario';
        document.getElementById('modalComentario').classList.remove('hidden');
        // Mostrar selector en edición
        document.getElementById('comentario_perfil_container').classList.remove('hidden');
    };

    async function saveComentario() {
        const id = document.getElementById('comentario_id').value;
        const payload = {
            texto: document.getElementById('comentario_texto').value.trim(),
            perfil: document.getElementById('comentario_perfil').value || null,
            activo: document.getElementById('comentario_activo').checked,
        };
        if (!payload.texto || !payload.perfil) return Notify.info('Texto y perfil son obligatorios.');

        const url = id ? `/api/comentarios/${id}/` : '/api/comentarios/';
        const method = id ? 'PUT' : 'POST';

        try {
            const resp = await fetch(url, {
                method, headers: jsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Error al guardar');
            closeModal('modalComentario');
            loadComentarios();
            loadPerfilesComentarios();
        } catch (err) { Notify.error('Error: ' + err.message); }
    }

    window.deleteComentario = async function (id) {
        const c = comentariosData.find(x => x.id === id);
        const name = c ? `"${c.texto}"` : 'este comentario';
        const confirmed = await Notify.confirmDanger(`¿Estás seguro de que deseas eliminar <strong>${name}</strong>?`, {
            title: 'Eliminar Comentario',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await fetch(`/api/comentarios/${id}/`, {
                method: 'DELETE', headers: csrfHeaders()
            });
            loadComentarios();
            loadPerfilesComentarios();
        } catch (err) { Notify.error('Error al eliminar.'); }
    };

    // ==========================================
    // PERFILES DE SUPLEMENTOS
    // ==========================================
    async function loadPerfilesSuplementos() {
        try {
            perfilesSuplementosData = await apiLoadPerfilesSuplementos();
            if (activeTab === 'suplementos') {
                renderPerfilesSuplementos();
                updateFiltersForSubTab();
                updatePerfilSuplementoSelects();
            }
            updateGeneralButtonsState();
        } catch (err) { console.error(err); }
    }

    function renderPerfilesSuplementos() {
        const tbody = document.getElementById('tbody-perfiles-suplementos');
        tbody.innerHTML = '';
        syncFilterState();

        let filtered = perfilesSuplementosData.filter(p => {
            // Filtrar por departamento cuando en sub-vista perfiles
            if (filterPrimaryValue && activeSubTab === 'suplementos-perfiles') {
                const deptoId = parseInt(filterPrimaryValue);
                if (!(p.departamentos_ids || []).includes(deptoId)) return false;
            }
            if (searchString) {
                return String(p.id).includes(searchString) || p.nombre.toLowerCase().includes(searchString);
            }
            return true;
        });
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No se encontraron perfiles.</td></tr>';
            return;
        }

        filtered.forEach((p, index) => {
            const statusHtml = p.activo
                ? '<span class="status-badge active">ACTIVO</span>'
                : '<span class="status-badge inactive">INACTIVO</span>';
            const numSuplementos = p.suplementos ? p.suplementos.length : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${p.id}</td>
                <td class="font-weight-bold">${escapeHtml(p.nombre)}</td>
                <td class="text-center">${numSuplementos}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar (${p.id})" onclick="editPerfilSuplemento(${p.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn" title="Añadir Suplemento" onclick="openModalSuplementoForPerfil(${p.id})">
                        <img src="/static/ui/img/iconos/plus.svg" alt="Añadir">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deletePerfilSuplemento(${p.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updatePerfilSuplementoSelects() {
        const select = document.getElementById('suplemento_perfil');
        if (!select) return;
        const transSelect = document.getElementById('js-translations')?.dataset.seleccionar || 'Seleccionar';
        select.innerHTML = `<option value="">${transSelect}</option>`;
        perfilesSuplementosData.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre;
            select.appendChild(opt);
        });
    }

    function updateFiltersForSubTab() {
        const isPerfiles = activeSubTab.endsWith('-perfiles');
        const deptaContainer = document.getElementById('filterPrimaryContainer');
        const secondaryContainer = document.getElementById('filterSecondaryContainer');
        const primaryOptions = document.getElementById('primaryOptions');
        const secondaryOptions = document.getElementById('secondaryOptions');
        const primaryTrigger = document.getElementById('primaryTrigger');
        const secondaryTrigger = document.getElementById('secondaryTrigger');
        const primaryLabel = document.getElementById('filterPrimaryLabel');
        const secondaryLabel = document.getElementById('filterSecondaryLabel');
        const sortFieldOptions = document.getElementById('sortFieldOptions');

        if (!deptaContainer || !secondaryContainer || !sortFieldOptions) return;

        // Reset Primary/Secondary
        primaryOptions.innerHTML = '<div class="custom-option is-selected" data-value="">Todos</div>';
        secondaryOptions.innerHTML = '<div class="custom-option is-selected" data-value="">Todos</div>';
        primaryTrigger.querySelector('span').textContent = 'Todos';
        secondaryTrigger.querySelector('span').textContent = 'Todos';

        // Dynamic Sort Options
        const currentSort = getCustomSelectValue('customSortField') || 'id';
        sortFieldOptions.innerHTML = '';
        if (isPerfiles) {
            const itemLabel = activeTab === 'comentarios' ? 'Nº Coments' : 'Nº Suplem';
            sortFieldOptions.innerHTML = `
                <div class="custom-option" data-value="id">ID</div>
                <div class="custom-option" data-value="nombre">Nombre</div>
                <div class="custom-option" data-value="num_items">${itemLabel}</div>
                <div class="custom-option" data-value="activo">Estado</div>
            `;
        } else {
            sortFieldOptions.innerHTML = `
                <div class="custom-option" data-value="id">ID</div>
                <div class="custom-option" data-value="nombre">Nombre</div>
                <div class="custom-option" data-value="perfil">Perfil</div>
                <div class="custom-option" data-value="activo">Estado</div>
            `;
        }
        setCustomSelectValue('customSortField', currentSort);

        if (activeTab === 'comentarios') {
            if (activeSubTab === 'comentarios-perfiles') {
                deptaContainer.classList.add('hidden');
                secondaryContainer.classList.add('hidden');
            } else {
                // Lista de comentarios
                deptaContainer.classList.remove('hidden');
                secondaryContainer.classList.add('hidden');
                primaryLabel.textContent = 'Perfil (Categoría)';
                perfilesComentariosData.forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'custom-option';
                    div.setAttribute('data-value', p.id);
                    div.textContent = p.nombre;
                    primaryOptions.appendChild(div);
                });
            }
        } else {
            // Suplementos
            if (activeSubTab === 'suplementos-perfiles') {
                deptaContainer.classList.add('hidden');
                secondaryContainer.classList.add('hidden');
            } else {
                // Lista de suplementos
                deptaContainer.classList.remove('hidden');
                secondaryContainer.classList.remove('hidden');
                primaryLabel.textContent = 'Perfil (Categoría)';
                secondaryLabel.textContent = 'Producto Base';

                perfilesSuplementosData.forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'custom-option';
                    div.setAttribute('data-value', p.id);
                    div.textContent = p.nombre;
                    primaryOptions.appendChild(div);
                });
                // Productos base
                productosData.forEach(prod => {
                    const div = document.createElement('div');
                    div.className = 'custom-option';
                    div.setAttribute('data-value', prod.id);
                    div.textContent = prod.nombre;
                    secondaryOptions.appendChild(div);
                });
            }
        }
        syncAndRender();
    }

    function openModalPerfilSuplemento() {
        document.getElementById('formPerfilSuplemento').reset();
        document.getElementById('perfil_suplemento_id').value = '';
        document.getElementById('modalPerfilSuplementoTitle').innerText = 'Nuevo Perfil de Suplementos';
        document.getElementById('perfil_suplemento_activo').checked = true;
        populateMultiSelect('perfil_suplemento_deptos', departamentosData, []);
        populateMultiSelect('perfil_suplemento_prods', productosData, []);
        document.getElementById('modalPerfilSuplemento').classList.remove('hidden');
        document.getElementById('modalPerfilSuplemento').style.display = 'flex';
    }

    window.editPerfilSuplemento = function (id) {
        const p = perfilesSuplementosData.find(x => x.id === id);
        if (!p) return;
        document.getElementById('perfil_suplemento_id').value = p.id;
        document.getElementById('perfil_suplemento_nombre').value = p.nombre;
        document.getElementById('perfil_suplemento_activo').checked = p.activo;
        document.getElementById('modalPerfilSuplementoTitle').innerText = 'Editar Perfil de Suplementos';
        populateMultiSelect('perfil_suplemento_deptos', departamentosData, p.departamentos_ids || []);
        populateMultiSelect('perfil_suplemento_prods', productosData, p.productos_ids || []);
        document.getElementById('modalPerfilSuplemento').classList.remove('hidden');
        document.getElementById('modalPerfilSuplemento').style.display = 'flex';
    };

    async function savePerfilSuplemento() {
        const id = document.getElementById('perfil_suplemento_id').value;
        const payload = {
            nombre: document.getElementById('perfil_suplemento_nombre').value.trim(),
            activo: document.getElementById('perfil_suplemento_activo').checked,
            departamentos_ids: getMultiSelectValues('perfil_suplemento_deptos'),
            productos_ids: getMultiSelectValues('perfil_suplemento_prods'),
        };
        if (!payload.nombre) return Notify.info('Nombre obligatorio.');

        const url = id ? `/api/perfiles-suplementos/${id}/` : '/api/perfiles-suplementos/';
        const method = id ? 'PUT' : 'POST';

        try {
            const resp = await fetch(url, {
                method, headers: jsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Error al guardar');
            closeModal('modalPerfilSuplemento');
            loadPerfilesSuplementos();
        } catch (err) { Notify.error('Error: ' + err.message); }
    }

    window.deletePerfilSuplemento = async function (id) {
        const p = perfilesSuplementosData.find(item => item.id == id);
        const count = p && p.suplementos ? p.suplementos.length : 0;
        
        if (count > 0) {
            const listHtml = p.suplementos.map(s => `<li>${escapeHtml(s.nombre)}</li>`).join('');
            return UI.dialog({
                title: 'Perfil con contenido',
                message: `
                    <p class="mb-3">El perfil <strong>"${escapeHtml(p.nombre)}"</strong> tiene <strong>${count}</strong> suplementos activos y no puede eliminarse.</p>
                    <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.15); padding: 8px 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; text-align: left;">
                        <ul style="margin: 0; padding-left: 18px; color: var(--text); opacity: 0.9; font-size: 0.9rem;">
                            ${listHtml}
                        </ul>
                    </div>
                `,
                type: 'lock',
                confirmText: 'Entendido',
                showCancel: false
            });
        }

        const confirmed = await Notify.confirmDanger('¿Eliminar este perfil de suplementos?', {
            title: 'Eliminar Perfil',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await fetch(`/api/perfiles-suplementos/${id}/`, {
                method: 'DELETE', headers: csrfHeaders()
            });
            loadPerfilesSuplementos();
            loadSuplementos();
        } catch (err) { Notify.error('Error al eliminar.'); }
    };

    // ==========================================
    // SUPLEMENTOS
    // ==========================================
    async function loadSuplementos() {
        try {
            suplementosData = await apiLoadSuplementos();
            if (activeTab === 'suplementos') renderSuplementos();
        } catch (err) { console.error(err); }
    }

    function renderSuplementos() {
        const tbody = document.getElementById('tbody-suplementos');
        tbody.innerHTML = '';
        syncFilterState();

        let filtered = suplementosData.filter(s => {
            if (filterPerfilId && s.perfil != filterPerfilId) return false;
            // Filtrar por producto (filterSecondaryValue)
            if (filterSecondaryValue) {
                const prodId = parseInt(filterSecondaryValue);
                const perfilObj = perfilesSuplementosData.find(p => p.id === s.perfil);
                if (!perfilObj || !(perfilObj.productos_ids || []).includes(prodId)) return false;
            }
            if (searchString) {
                return String(s.id).includes(searchString) || s.nombre.toLowerCase().includes(searchString);
            }
            return true;
        });
        filtered = applySorting(filtered);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron suplementos.</td></tr>';
            return;
        }

        filtered.forEach((s, index) => {
            const statusHtml = s.activo
                ? '<span class="status-badge active">ACTIVO</span>'
                : '<span class="status-badge inactive">INACTIVO</span>';
            const perfilObj = perfilesSuplementosData.find(p => p.id === s.perfil);
            const perfilNombre = perfilObj ? escapeHtml(perfilObj.nombre) : '<span class="text-muted">Sin perfil</span>';

            let displayNombre = escapeHtml(s.nombre);
            let displayPrecio = parseFloat(s.precio).toFixed(2) + ' €';
            let badgeHtml = '';

            if (s.nombre === '__MANUAL_TEXT__') {
                displayNombre = '<span style="color: #64ffda;">Comentario libre</span>';
                badgeHtml = '<span class="badge-special ml-2">HERRAMIENTA</span>';
                displayPrecio = '<span class="text-mini opacity-0.5">N/A</span>';
            } else if (s.nombre === '__MANUAL_PRICE__') {
                displayNombre = '<span style="color: #64ffda;">Comodín</span>';
                badgeHtml = '<span class="badge-special ml-2">HERRAMIENTA</span>';
                displayPrecio = '<span style="color: #64ffda; font-weight: bold;">Manual</span>';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-muted">${s.id}</td>
                <td class="font-weight-bold">
                    <div class="flex items-center gap-2">
                        ${displayNombre}
                        ${badgeHtml}
                    </div>
                </td>
                <td class="text-right tabular-nums">${displayPrecio}</td>
                <td>${perfilNombre}</td>
                <td>${statusHtml}</td>
                <td class="col-actions text-right">
                    <button class="action-btn" title="Editar (${s.id})" onclick="editSuplemento(${s.id})">
                        <img src="/static/ui/img/iconos/pencil.svg" alt="Editar">
                    </button>
                    <button class="action-btn action-btn--delete" title="Eliminar" onclick="deleteSuplemento(${s.id})">
                        <img src="/static/ui/img/iconos/trash-2.svg" alt="Eliminar">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.openModalSuplementoForPerfil = function (perfilId) {
        document.getElementById('formSuplemento').reset();
        document.getElementById('suplemento_id').value = '';
        document.getElementById('suplemento_perfil').value = perfilId;
        document.getElementById('suplemento_activo').checked = true;
        document.getElementById('modalSuplementoTitle').innerText = 'Nuevo Suplemento';
        document.getElementById('modalSuplemento').classList.remove('hidden');
        document.getElementById('modalSuplemento').style.display = 'flex';
        // Ocultar selector de perfil
        document.getElementById('suplemento_perfil_container').classList.add('hidden');
    };

    window.openModalSuplemento = function () {
        document.getElementById('formSuplemento').reset();
        document.getElementById('suplemento_id').value = '';
        document.getElementById('suplemento_activo').checked = true;
        document.getElementById('modalSuplementoTitle').innerText = 'Nuevo Suplemento';
        document.getElementById('modalSuplemento').classList.remove('hidden');
        document.getElementById('modalSuplemento').style.display = 'flex';
        // Mostrar selector de perfil
        updatePerfilSuplementoSelects();
        document.getElementById('suplemento_perfil_container').classList.remove('hidden');
    };

    window.editSuplemento = function (id) {
        const s = suplementosData.find(x => x.id === id);
        if (!s) return;
        document.getElementById('suplemento_id').value = s.id;
        document.getElementById('suplemento_nombre').value = s.nombre;
        document.getElementById('suplemento_precio').value = parseFloat(s.precio).toFixed(2);
        updatePerfilSuplementoSelects();
        document.getElementById('suplemento_perfil').value = s.perfil || '';
        document.getElementById('suplemento_activo').checked = s.activo;
        document.getElementById('modalSuplementoTitle').innerText = 'Editar Suplemento';
        document.getElementById('modalSuplemento').classList.remove('hidden');
        document.getElementById('modalSuplemento').style.display = 'flex';
        // Mostrar selector en edición
        document.getElementById('suplemento_perfil_container').classList.remove('hidden');
    };

    async function saveSuplemento() {
        const id = document.getElementById('suplemento_id').value;
        let precioVal = document.getElementById('suplemento_precio').value.trim().replace(',', '.');
        const payload = {
            nombre: document.getElementById('suplemento_nombre').value.trim(),
            precio: parseFloat(precioVal) || 0,
            perfil: document.getElementById('suplemento_perfil').value || null,
            activo: document.getElementById('suplemento_activo').checked,
        };
        if (!payload.nombre || !payload.perfil) return Notify.info('Nombre y perfil son obligatorios.');

        const url = id ? `/api/suplementos/${id}/` : '/api/suplementos/';
        const method = id ? 'PUT' : 'POST';

        try {
            const resp = await fetch(url, {
                method, headers: jsonHeaders(),
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Error al guardar');
            closeModal('modalSuplemento');
            loadSuplementos();
            loadPerfilesSuplementos();
        } catch (err) { Notify.error('Error: ' + err.message); }
    }

    window.deleteSuplemento = async function (id) {
        const s = suplementosData.find(x => x.id === id);
        const name = s ? `"${s.nombre}"` : 'este suplemento';
        const confirmed = await Notify.confirmDanger(`¿Estás seguro de que deseas eliminar <strong>${name}</strong>?`, {
            title: 'Eliminar Suplemento',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await fetch(`/api/suplementos/${id}/`, {
                method: 'DELETE', headers: csrfHeaders()
            });
            loadSuplementos();
            loadPerfilesSuplementos();
        } catch (err) { Notify.error('Error al eliminar.'); }
    };

    // Formateo precio al salir del campo
    const precioInput = document.getElementById('suplemento_precio');
    if (precioInput) {
        precioInput.addEventListener('blur', (e) => {
            let val = e.target.value.trim().replace(',', '.');
            let floatVal = parseFloat(val);
            if (!isNaN(floatVal)) {
                e.target.value = floatVal.toFixed(2);
            }
        });
    }
    initManualTools({
        escapeHtml,
        getCsrfToken,
        getPerfilesComentarios: () => perfilesComentariosData,
        getPerfilesSuplementos: () => perfilesSuplementosData,
        getComentarios: () => comentariosData,
        getSuplementos: () => suplementosData,
        loadComentarios,
        loadSuplementos,
        ui: UI,
        closeModal,
        openModalById
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModificadoresApp);
} else {
    initModificadoresApp();
}

