import { initIconBrowser } from './icons.js';

export function initCatalogoExtras({ escapeHtml, getCookie, openModalById, ui }) {
    const t = window.t || ((key, fallback) => fallback || key);
    const closeModal = window.closeModal || function () {};

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
    initIconBrowser({ updateLivePreview, closeModal });

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
            window.Notify.info(t('catalogo.config.saveProductFirst', 'Primero guarda el producto para poder editar su plantilla.'));
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
                    <button type="button" class="btn-add-option-dashed flex-1 m-0" style="height: 42px; border: 1px dashed rgba(255,255,255,0.2);" onclick="openImportModal(${gIdx})">
                        ⬇️ Importar de Perfiles (Suplementos/Comentarios)
                    </button>
                </div>
            `;
            groupsList.appendChild(div);

            // Render Opciones del grupo
            const optionsGrid = div.querySelector(`#group-options-${gIdx}`);
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

                    // Traducción estética para opciones especiales
                    let displayNombre = o.nombre;
                    let extraLabel = '';
                    let isSpecial = false;

                    if (o.nombre === '__MANUAL_TEXT__') {
                        displayNombre = 'Comentario libre';
                        extraLabel = '<span class="badge-special">MANUAL</span>';
                        isSpecial = true;
                    } else if (o.nombre === '__MANUAL_PRICE__') {
                        displayNombre = 'Comodín';
                        extraLabel = '<span class="badge-special">MANUAL</span>';
                        isSpecial = true;
                    }

                    const oDiv = document.createElement('div');
                    oDiv.className = 'config-opcion-card' + (isSpecial ? ' config-opcion-card--special' : '');
                    oDiv.innerHTML = `
                        <div class="opcion-card-header" style="flex-wrap: wrap; gap: 4px;">
                            ${isSpecial ?
                                `<span class="input-invisible flex-1 font-bold" style="color: #64ffda;">${displayNombre}</span>` :
                                `<input type="text" class="input-invisible flex-1" style="min-width: 120px;" value="${escapeHtml(o.nombre)}" placeholder="Ej: Integral" onchange="updateOption(${gIdx}, ${oIdx}, 'nombre', this.value)">`
                            }
                            ${!isSpecial ? `
                            <div class="flex items-center gap-1" title="Precio base de referencia">
                                <input type="number" step="0.01" class="form-control form-control--compact form-control--minimal" style="width: 55px; text-align: right; background: rgba(255,255,255,0.05);" value="${o.precio_base || '0.00'}" onchange="updateOption(${gIdx}, ${oIdx}, 'precio_base', this.value)">
                                <span class="text-muted" style="font-size: 0.7rem;">€</span>
                            </div>
                            ` : extraLabel}
                            <button type="button" class="btn-trash-discrete m-0" style="width:24px; height:24px;" onclick="removeOption(${gIdx}, ${oIdx})">
                                <img src="/static/ui/img/iconos/trash-2.svg" alt="" style="width:12px; height:12px;">
                            </button>
                        </div>
                        <div class="opcion-card-body">
                            ${!isSpecial ? pricesHtml : `<div class="p-2 text-center text-tiny text-muted opacity-0.8"><em>Al pulsar en el TPV, se abrirá el teclado para entrada manual.</em></div>`}
                            <div class="flex items-center justify-between mt-2 pt-2" style="border-top: 1px solid rgba(255,255,255,0.05);">
                                <label class="custom-checkbox-wrap text-tiny text-muted" title="Por defecto preseleccionado" ${isSpecial ? 'style="visibility:hidden"' : ''}>
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

        // Sección de Especiales
        const espContainer = document.getElementById('importListEspeciales');
        if (espContainer) {
            espContainer.innerHTML = '';
            const manualItems = [
                { id: 'text', nombre: 'Comentario Manual', desc: 'Permite escribir un texto libre en el TPV' },
                { id: 'price', nombre: 'Suplemento Manual', desc: 'Permite escribir texto + precio en el TPV' }
            ];
            manualItems.forEach(item => {
                if (query && !item.nombre.toLowerCase().includes(query)) return;
                espContainer.innerHTML += `
                    <div class="profile-import-item profile-import-item--special" onclick="showProfileItems('esp', '${item.id}')">
                        <span class="font-bold text-sm" style="color: #64ffda;">${escapeHtml(item.nombre)}</span>
                        <span class="text-xs text-muted">${item.desc}</span>
                    </div>
                `;
            });
        }
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
        } else if (type === 'com') {
            perfil = window.cachedPerfiles.comentarios.find(p => p.id === id);
            pItems = perfil ? perfil.comentarios : [];
        } else {
            // Especiales
            perfil = { nombre: 'Entradas Manuales' };
            if (id === 'text') {
                pItems = [{ nombre: 'Comentario Manual', es_manual: true, tipo: 'text' }];
            } else {
                pItems = [{ nombre: 'Suplemento Manual', es_manual: true, tipo: 'price' }];
            }
        }

        title.textContent = perfil ? perfil.nombre : 'Opciones';

        pItems.forEach((item, idx) => {
            const itemName = isComment ? item.texto : item.nombre;
            const itemPrice = (isComment || item.es_manual) ? null : (item.precio || '0.00');

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
                    <div class="text-sm font-bold" style="${item.es_manual ? 'color: #64ffda;' : 'color: #fff;'}">${escapeHtml(itemName)}</div>
                    ${itemPrice !== null ? `<div class="text-tiny text-muted" style="opacity:0.5;">${itemPrice} €</div>` : ''}
                    ${item.es_manual ? `<div class="text-tiny" style="color: #64ffda; opacity: 0.8;">[Entrada Manual]</div>` : ''}
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
                let itemName = (type === 'com') ? item.texto : item.nombre;
                let itemPrice = (type === 'com') ? "0.00" : (item.precio || "0.00");

                // Identificadores especiales para el backend/TPV
                if (item.es_manual) {
                    if (item.tipo === 'text') itemName = '__MANUAL_TEXT__';
                    else itemName = '__MANUAL_PRICE__';
                    itemPrice = "0.00";
                }

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
                window.Notify.success(t('catalogo.template.saved', 'Plantilla guardada correctamente.'));
                closeModal('modalConfigTemplate');
            } else {
                window.Notify.error(t('catalogo.template.saveError', 'Error al guardar la plantilla.'));
            }
        } catch (err) {
            console.error(err);
        }
    };

    return { updateLivePreview };
}


