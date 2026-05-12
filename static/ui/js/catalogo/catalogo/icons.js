export function initIconBrowser({ updateLivePreview, closeModal }) {
    window.openModalIconos = async function () {
        const modal = document.getElementById('modalIconos');
        const grid = document.getElementById('iconosGrid');
        if (!modal || !grid) return;

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
            renderCategory(categorias[catNames[0]], grid);
        } catch (error) {
            console.error('Error al cargar iconos:', error);
            grid.innerHTML = '<p class="p-4 text-center text-danger">Error al cargar iconos.</p>';
        }
    };

    window.seleccionarIcono = function (icono) {
        const hiddenInput = document.getElementById('prod_icono_boton');
        const preview = document.getElementById('iconPreview');

        if (hiddenInput) hiddenInput.value = icono.url;
        if (preview) preview.innerHTML = `<img src="${icono.url}" alt="${icono.nombre}" style="width:24px;height:24px;object-fit:contain;">`;

        updateLivePreview();
        closeModal('modalIconos');
    };
}

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
