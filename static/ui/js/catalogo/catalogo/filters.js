const state = {
    searchString: '',
    sortField: 'id',
    sortDir: 'asc',
    deptoFilterId: '',
};

export function initCatalogoFilters({ t, getActiveTab, renderActiveTab }) {
    const searchInput = document.getElementById('searchInput');
    const sortDirBtn = document.getElementById('sortDirBtn');
    const btnToggleFilters = document.getElementById('btnToggleFilters');
    const filterPopover = document.getElementById('filterPopover');
    const btnClearFilters = document.getElementById('btnClearFilters');

    initCustomSelect('customFilterDepto', onFilterChange);
    initCustomSelect('customSortField', onFilterChange);

    function onFilterChange() {
        syncFilterState();
        renderActiveTab(getActiveTab());
    }

    searchInput?.addEventListener('input', onFilterChange);

    if (btnToggleFilters && filterPopover) {
        btnToggleFilters.addEventListener('click', (e) => {
            e.stopPropagation();
            filterPopover.classList.toggle('is-active');
            closeCustomSelects();
        });

        document.getElementById('btnApplyFilters')?.addEventListener('click', () => {
            filterPopover.classList.remove('is-active');
        });

        document.addEventListener('click', (e) => {
            if (!filterPopover.contains(e.target) && !btnToggleFilters.contains(e.target)) {
                filterPopover.classList.remove('is-active');
            }
            if (!e.target.closest('.custom-select')) {
                closeCustomSelects();
            }
        });

        filterPopover.addEventListener('click', (e) => e.stopPropagation());
    }

    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            setCustomSelectValue('customFilterDepto', '', t('catalogo.allDepartments', '-- Todos los Deptos --'));
            setCustomSelectValue('customSortField', 'id', t('catalogo.sort.id', 'ID'));
            state.sortDir = 'asc';
            updateSortDirUI(sortDirBtn, t);
            onFilterChange();
            filterPopover?.classList.remove('is-active');
        });
    }

    updateSortDirUI(sortDirBtn, t);

    sortDirBtn?.addEventListener('click', () => {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        updateSortDirUI(sortDirBtn, t);
        onFilterChange();
    });
}

export function syncFilterState() {
    state.searchString = (document.getElementById('searchInput')?.value || '').toLowerCase();
    state.sortField = getCustomSelectValue('customSortField') || 'id';
    state.deptoFilterId = getCustomSelectValue('customFilterDepto') || '';
}

export function getFilterState() {
    return { ...state };
}

export function applySorting(array) {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return array.sort((a, b) => {
        if (state.sortField === 'id') return (a.id - b.id) * dir;
        if (state.sortField === 'nombre') {
            return (a.nombre || '').localeCompare(b.nombre || '') * dir;
        }
        if (state.sortField === 'precio') {
            return (parseFloat(a.precio || 0) - parseFloat(b.precio || 0)) * dir;
        }
        if (state.sortField === 'activo') {
            return ((a.activo === b.activo) ? 0 : a.activo ? -1 : 1) * dir;
        }
        return 0;
    });
}

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

function updateSortDirUI(sortDirBtn, t) {
    if (!sortDirBtn) return;
    sortDirBtn.className = 'btn-sort-option';
    sortDirBtn.innerHTML = state.sortDir === 'asc'
        ? `<img src="/static/ui/img/iconos/move-up.svg" alt=""> <span id="sortDirText">${t('common.sortAsc', 'Ascendente')}</span>`
        : `<img src="/static/ui/img/iconos/move-down.svg" alt=""> <span id="sortDirText">${t('common.sortDesc', 'Descendente')}</span>`;
    sortDirBtn.title = state.sortDir === 'asc' ? t('common.sortAsc', 'Ascendente') : t('common.sortDesc', 'Descendente');
}

function closeCustomSelects() {
    document.querySelectorAll('.custom-select').forEach(cs => cs.classList.remove('is-active'));
}
