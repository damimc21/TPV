export function initManualTools({
    escapeHtml,
    getCsrfToken,
    getPerfilesComentarios,
    getPerfilesSuplementos,
    getComentarios,
    getSuplementos,
    loadComentarios,
    loadSuplementos,
    ui,
    closeModal,
    openModalById
}) {
    const t = window.t || ((key, fallback) => fallback || key);

    window.createManualItem = async function (type, _subtype, perfilIdOverride = null) {
        let perfilId = perfilIdOverride;
        if (!perfilId) {
            perfilId = type === 'com'
                ? document.getElementById('comentario_perfil').value
                : document.getElementById('suplemento_perfil').value;
        }

        if (!perfilId) {
            return window.Notify.info(
                t('modifiers.manual.mustSelectProfile', 'Primero debes seleccionar un perfil para añadir esta herramienta.')
            );
        }

        const specialName = type === 'com' ? '__MANUAL_TEXT__' : '__MANUAL_PRICE__';
        const dataSet = type === 'com' ? getComentarios() : getSuplementos();
        const exists = dataSet.some((item) => item.perfil == perfilId && (item.texto === specialName || item.nombre === specialName));

        if (exists) {
            closeModal('modalHerramientas');
            return window.Notify.info(
                t('modifiers.manual.alreadyExists', 'Esta herramienta ya está creada en este perfil.')
            );
        }

        const payload = type === 'com'
            ? {
                texto: specialName,
                perfil: parseInt(perfilId, 10),
                activo: true,
                orden: -100,
            }
            : {
                nombre: specialName,
                precio: '0.00',
                perfil: parseInt(perfilId, 10),
                activo: true,
                orden: -100,
            };

        const url = type === 'com' ? '/api/comentarios/' : '/api/suplementos/';

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) throw new Error('Error al crear la herramienta');

            const profileName = toolSelectedPerfilNombre || 'perfil';
            window.Notify.success(
                t(
                    'modifiers.manual.addedToProfile',
                    'Has añadido correctamente la herramienta al perfil <strong style="color: #64ffda;">{profile}</strong>.',
                    { profile: escapeHtml(profileName) }
                ),
                { title: t('modifiers.manual.successTitle', 'Operación exitosa'), allowHtml: true }
            );
            closeModal('modalHerramientas');
            closeModal('modalComentario');
            closeModal('modalSuplemento');

            if (type === 'com') {
                loadComentarios();
            } else {
                loadSuplementos();
            }
        } catch (err) {
            window.Notify.error('Error: ' + err.message);
        }
    };

    let currentToolType = 'com';
    let toolSelectedPerfilId = null;
    let toolSelectedPerfilNombre = null;

    window.openModalHerramientas = function (type) {
        currentToolType = type;
        const title = document.getElementById('modalHerramientasTitle');
        const info = document.getElementById('herramientaInfo');
        const lista = document.getElementById('herramientaPerfilLista');
        const btnConfirm = document.getElementById('btnConfirmarHerramienta');

        const perfiles = type === 'com' ? getPerfilesComentarios() : getPerfilesSuplementos();

        if (type === 'com') {
            title.textContent = t('modifiers.manual.commentTitle', 'Añadir comentario libre');
            info.innerHTML = t('modifiers.manual.commentInfo', 'Permite añadir observaciones personalizadas o notas manuales directamente desde el TPV.');
        } else {
            title.textContent = t('modifiers.manual.priceTitle', 'Añadir comodín');
            info.innerHTML = t('modifiers.manual.priceInfo', 'Permite añadir suplementos especiales o fuera de carta con precios personalizados.');
        }

        if (perfiles.length === 0) {
            lista.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; background: rgba(255,82,82,0.05); border-radius: 8px; border: 1px dashed rgba(255,82,82,0.2); color: #ff5252; font-weight: 600;">
                    ${t('modifiers.manual.noProfiles', 'No existen perfiles disponibles. Crea uno para poder añadir esta herramienta.')}
                </div>
            `;
            btnConfirm.disabled = true;
            btnConfirm.style.opacity = '0.3';
            btnConfirm.style.pointerEvents = 'none';
        } else {
            btnConfirm.disabled = false;
            btnConfirm.style.opacity = '1';
            btnConfirm.style.pointerEvents = 'auto';

            toolSelectedPerfilId = perfiles[0].id;
            toolSelectedPerfilNombre = perfiles[0].nombre;
            lista.innerHTML = perfiles.map((perfil) => `
                <div class="perfil-card-select ${perfil.id === toolSelectedPerfilId ? 'is-selected' : ''}"
                     onclick="selectToolPerfil('${perfil.id}')"
                     id="tool-perfil-${perfil.id}"
                     style="padding: 1rem 1.25rem; background: #1e1e1e; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; cursor: pointer; color: #fff; font-weight: 500; transition: all 0.2s ease; display: flex; align-items: center; justify-content: space-between;">
                    ${escapeHtml(perfil.nombre)}
                    <div class="status-dot" style="width: 12px; height: 12px; border-radius: 50%; background: ${perfil.id === toolSelectedPerfilId ? '#64ffda' : 'transparent'}; border: 2px solid ${perfil.id === toolSelectedPerfilId ? '#64ffda' : 'rgba(255,255,255,0.2)'};"></div>
                </div>
            `).join('');
        }

        openModalById('modalHerramientas');
    };

    window.selectToolPerfil = function (id) {
        toolSelectedPerfilId = id;
        document.querySelectorAll('.perfil-card-select').forEach((card) => {
            const isTarget = card.id === `tool-perfil-${id}`;
            card.classList.toggle('is-selected', isTarget);

            if (isTarget) {
                toolSelectedPerfilNombre = card.textContent.trim();
            }

            card.style.borderColor = isTarget ? 'rgba(100,255,218,0.5)' : 'rgba(255,255,255,0.08)';
            card.style.background = isTarget ? 'rgba(100,255,218,0.05)' : '#1e1e1e';

            const dot = card.querySelector('.status-dot');
            if (dot) {
                dot.style.background = isTarget ? '#64ffda' : 'transparent';
                dot.style.borderColor = isTarget ? '#64ffda' : 'rgba(255,255,255,0.2)';
            }
        });
    };

    const btnConfirm = document.getElementById('btnConfirmarHerramienta');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (!toolSelectedPerfilId) return;
            window.createManualItem(currentToolType, 'price', toolSelectedPerfilId);
        });
    }
}
