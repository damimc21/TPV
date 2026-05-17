import {
    escapeHtml,
    getCookie,
    getUnitOptionsHtml,
} from './utils.js';

const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
    ? window.gettext
    : (text) => text;

function normalizePlantillaSections(plantillas, productos) {
    const sections = [];
    plantillas.forEach(grupo => {
        (grupo.subcategorias || []).forEach(sub => {
            sections.push({
                id: sub.id,
                groupId: grupo.id,
                groupName: grupo.nombre,
                name: sub.nombre,
                source: 'template',
                items: (sub.articulos || []).map((art, idx) => ({
                    id: `tpl-${sub.id}-${idx}`,
                    nombre: art.nombre,
                    categoria: art.categoria || grupo.nombre,
                    unidad: 'ud',
                    sourceLabel: `${grupo.nombre} / ${sub.nombre}`,
                    source: 'template',
                })),
            });
        });
    });

    const productosPorDepto = {};
    productos.forEach(p => {
        if (p.eliminado === true) return;
        const depto = p.departamento_nombre || p.departamento || gettext('Sin departamento');
        if (!productosPorDepto[depto]) productosPorDepto[depto] = [];
        productosPorDepto[depto].push(p);
    });

    Object.entries(productosPorDepto).forEach(([depto, productosDepto]) => {
        sections.push({
            id: `tpv-${String(depto).replace(/\s+/g, '-').toLowerCase()}`,
            groupId: 'tpv',
            groupName: gettext('Productos TPV'),
            name: depto,
            source: 'tpv',
            items: productosDepto.map(p => ({
                id: `tpv-${p.id}`,
                nombre: p.nombre,
                categoria: gettext('Productos TPV'),
                unidad: 'ud',
                sourceLabel: `TPV / ${depto}`,
                source: 'tpv',
                producto_vinculado_id: p.id,
                auto_descontar: false,
            })),
        });
    });

    return sections;
}

export function initPlantillasInventario({ Notify, fetchProductosBase, loadData, closeModal }) {
    let plantillaSections = [];
    let plantillaCurrentId = '';
    let plantillaOpenGroups = {};
    let plantillaSelected = {};

    function updatePlantillasSelectedCount() {
        const count = Object.keys(plantillaSelected).length;
        const el = document.getElementById('plantillasSelectedCount');
        if (el) {
            el.textContent = count === 1
                ? gettext('1 seleccionado')
                : gettext('%s seleccionados').replace('%s', count);
        }
    }

    function renderPlantillaTree() {
        const tree = document.getElementById('plantillasTree');
        if (!tree) return;

        const groups = {};
        plantillaSections.forEach(section => {
            if (!groups[section.groupId]) {
                groups[section.groupId] = { id: section.groupId, name: section.groupName, sections: [] };
            }
            groups[section.groupId].sections.push(section);
        });

        tree.innerHTML = Object.values(groups).map(group => {
            const isOpen = Boolean(plantillaOpenGroups[group.id]);
            const arrowIcon = isOpen ? 'move-up' : 'move-down';
            return `
            <div class="tpl-tree-group ${isOpen ? 'is-open' : ''}">
                <button type="button" class="tpl-tree-title" onclick="togglePlantillaGroup('${group.id}')">
                    <span>${escapeHtml(group.name)}</span>
                    <span class="tpl-tree-meta">
                        <span>${group.sections.length}</span>
                        <img src="/static/ui/img/iconos/${arrowIcon}.svg" class="tpl-tree-arrow svg-icon" width="12" alt="">
                    </span>
                </button>
                <div class="tpl-tree-children">
                    ${group.sections.map(section => `
                        <button type="button" class="tpl-tree-btn ${section.id === plantillaCurrentId ? 'is-active' : ''}" onclick="selectPlantillaSection('${section.id}')">
                            <span>${escapeHtml(section.name)}</span>
                            <span class="tpl-tree-count">${section.items.length}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        }).join('');
    }

    function renderPlantillaItems() {
        const container = document.getElementById('plantillasContainer');
        const title = document.getElementById('plantillasPanelTitle');
        const subtitle = document.getElementById('plantillasPanelSubtitle');
        if (!container) return;

        const section = plantillaSections.find(s => s.id === plantillaCurrentId);
        if (!section) {
            container.innerHTML = `<div class="tpl-empty">${gettext('Selecciona una subcategoría del lateral.')}</div>`;
            return;
        }

        const query = (document.getElementById('plantillasSearch')?.value || '').toLowerCase();
        const items = section.items.filter(item => item.nombre.toLowerCase().includes(query));

        if (title) title.textContent = section.name;
        if (subtitle) {
            subtitle.textContent = section.source === 'tpv'
                ? gettext('Productos existentes del TPV. Por defecto se importan en unidades. Cámbialo si lo prefieres.')
                : gettext('%s. Por defecto se importa en unidades. Cámbiala antes de importar.').replace('%s', section.groupName);
        }

        if (items.length === 0) {
            container.innerHTML = `<div class="tpl-empty">${gettext('No hay elementos con esa búsqueda.')}</div>`;
            return;
        }

        const itemsHtml = items.map(item => {
            const selected = plantillaSelected[item.id];
            const state = selected || item;
            const disabled = selected ? '' : 'disabled';
            const autoToggleDisabled = (!selected || state.source !== 'tpv') ? 'disabled' : '';
            return `
                <div class="tpl-item ${selected ? 'is-selected' : ''}">
                    <div class="tpl-item-main">
                        <input type="checkbox" ${selected ? 'checked' : ''} onchange="togglePlantillaItem('${item.id}', this.checked)">
                        <div class="min-w-0">
                            <span class="tpl-item-name" title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</span>
                            <span class="tpl-item-source">${escapeHtml(item.sourceLabel)}</span>
                        </div>
                    </div>
                    <label class="tpl-field tpl-field-unit">
                        <span class="tpl-field-label">${gettext('Unidad')}</span>
                        <select ${disabled} onchange="updatePlantillaItem('${item.id}', 'unidad', this.value)">
                            ${getUnitOptionsHtml(state.unidad)}
                        </select>
                    </label>
                    <label class="tpl-field">
                        <span class="tpl-field-label">${gettext('Stock inicial')}</span>
                        <input ${disabled} type="number" step="0.01" value="${state.stock_actual || 0}" onchange="updatePlantillaItem('${item.id}', 'stock_actual', this.value)">
                    </label>
                    <label class="tpl-field">
                        <span class="tpl-field-label">${gettext('Stock mínimo')}</span>
                        <input ${disabled} type="number" step="0.01" value="${state.stock_minimo || 0}" onchange="updatePlantillaItem('${item.id}', 'stock_minimo', this.value)">
                    </label>
                    <div class="tpl-auto-wrap">
                        <label class="tpl-auto" title="${gettext('Descontar al vender el producto TPV vinculado')}">
                            <input type="checkbox" ${autoToggleDisabled} ${state.auto_descontar ? 'checked' : ''} onchange="updatePlantillaItem('${item.id}', 'auto_descontar', this.checked)">
                            <span>${gettext('Auto TPV')}</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        const legendHtml = `
            <div class="tpl-legend">
                <span>${gettext('Artículo')}</span>
                <span>${gettext('Unidad')}</span>
                <span>${gettext('Inicial')}</span>
                <span>${gettext('Mínimo')}</span>
                <span>${gettext('Auto TPV')}</span>
            </div>
        `;

        container.innerHTML = `<div class="tpl-list-inner">${legendHtml}${itemsHtml}</div>`;
        updatePlantillasSelectedCount();
    }

    function findPlantillaItem(id) {
        for (const section of plantillaSections) {
            const item = section.items.find(i => i.id === id);
            if (item) return item;
        }
        return null;
    }

    window.togglePlantillaGroup = (groupId) => {
        plantillaOpenGroups[groupId] = !plantillaOpenGroups[groupId];
        renderPlantillaTree();
    };

    window.selectPlantillaSection = (id) => {
        plantillaCurrentId = id;
        const section = plantillaSections.find(s => s.id === id);
        if (section) plantillaOpenGroups[section.groupId] = true;
        const search = document.getElementById('plantillasSearch');
        if (search) search.value = '';
        renderPlantillaTree();
        renderPlantillaItems();
    };

    window.renderPlantillaItems = renderPlantillaItems;

    window.togglePlantillaItem = (id, checked) => {
        const item = findPlantillaItem(id);
        if (!item) return;
        if (checked) {
            plantillaSelected[id] = {
                ...item,
                stock_actual: 0,
                stock_minimo: 0,
                auto_descontar: false,
            };
        } else {
            delete plantillaSelected[id];
        }
        renderPlantillaItems();
    };

    window.updatePlantillaItem = (id, key, value) => {
        if (!plantillaSelected[id]) {
            window.togglePlantillaItem(id, true);
        }
        plantillaSelected[id][key] = value;
        updatePlantillasSelectedCount();
    };

    async function loadPlantillas() {
        const container = document.getElementById('plantillasContainer');
        const tree = document.getElementById('plantillasTree');
        if (container) container.innerHTML = `<div class="tpl-empty">${gettext('Cargando plantillas...')}</div>`;
        if (tree) tree.innerHTML = `<div class="p-10 text-center opacity-50">${gettext('Cargando...')}</div>`;

        try {
            const resp = await fetch('/api/plantillas-inventario/');
            const productos = await fetchProductosBase();
            if (resp.ok) {
                const plantillas = await resp.json();
                plantillaSections = normalizePlantillaSections(plantillas, productos || []);
                plantillaCurrentId = '';
                plantillaOpenGroups = {};
                renderPlantillaTree();
                renderPlantillaItems();
                updatePlantillasSelectedCount();
            }
        } catch (e) {
            if (container) {
                container.innerHTML = `<div class="tpl-empty text-rose-500">${gettext('Error al cargar plantillas')}</div>`;
            }
        }
    }

    window.importarPlantillaSeleccionada = async () => {
        const artsToImport = Object.values(plantillaSelected).map(item => ({
            nombre: item.nombre,
            categoria: item.categoria,
            unidad: item.unidad || 'ud',
            stock_actual: String(item.stock_actual || 0).replace(',', '.'),
            stock_minimo: String(item.stock_minimo || 0).replace(',', '.'),
            producto_vinculado_id: item.producto_vinculado_id || null,
            auto_descontar: Boolean(item.producto_vinculado_id && item.auto_descontar),
            cantidad_por_venta: 1,
        }));

        if (artsToImport.length === 0) {
            Notify.info(gettext('Selecciona al menos un artículo para importar.'));
            return;
        }

        try {
            const resp = await fetch('/api/plantillas-inventario/importar/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({ articulos: artsToImport })
            });
            if (resp.ok) {
                plantillaSelected = {};
                closeModal('modalPlantillas');
                loadData();
            } else {
                Notify.error(gettext('No se pudo importar la selección.'));
            }
        } catch (e) { console.error(e); }
    };

    return { loadPlantillas };
}
