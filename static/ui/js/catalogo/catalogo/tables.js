import { escapeHtml } from './utils.js';

export function renderDepartamentosTable({ departamentos, isInitialLoad, t }) {
    const tbody = document.getElementById('tbody-departamentos');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (departamentos.length === 0) {
        tbody.innerHTML = isInitialLoad
            ? `<tr><td colspan="4" class="text-center text-muted">${t('catalogo.departments.loading', 'Cargando departamentos...')}</td></tr>`
            : `<tr><td colspan="4" class="text-center text-muted">${t('catalogo.departments.empty', 'No se encontraron departamentos.')}</td></tr>`;
        return;
    }

    departamentos.forEach((d) => {
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

export function renderProductosTable({ productos, departamentos, isInitialLoad, t }) {
    const tbody = document.getElementById('tbody-productos');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (productos.length === 0) {
        tbody.innerHTML = isInitialLoad
            ? `<tr><td colspan="6" class="text-center text-muted">${t('catalogo.products.loading', 'Cargando productos...')}</td></tr>`
            : `<tr><td colspan="6" class="text-center text-muted">${t('catalogo.products.empty', 'No se encontraron productos.')}</td></tr>`;
        return;
    }

    productos.forEach((p) => {
        const statusHtml = p.activo
            ? `<span class="status-badge active">ACTIVO</span>`
            : `<span class="status-badge inactive">INACTIVO</span>`;

        const deptoObj = departamentos.find(d => d.id === p.departamento);
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

export function updateDepartmentSelects({ departamentos, t }) {
    const selectModal = document.getElementById('prod_departamento');
    const deptoOptions = document.getElementById('deptoOptions');
    if (!selectModal || !deptoOptions) return;

    selectModal.innerHTML = '<option value="">-- Seleccionar --</option>';
    deptoOptions.innerHTML = `<div class="custom-option is-selected" data-value="">${t('catalogo.allDepartments', '-- Todos los Deptos --')}</div>`;

    departamentos.forEach(d => {
        const opt = `<option value="${d.id}">${escapeHtml(d.nombre)}</option>`;
        selectModal.insertAdjacentHTML('beforeend', opt);

        const div = document.createElement('div');
        div.className = 'custom-option';
        div.setAttribute('data-value', d.id);
        div.textContent = d.nombre;
        deptoOptions.appendChild(div);
    });
}
