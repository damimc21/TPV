(function () {
    const Notify = window.Notify || {
        info: (msg) => Promise.resolve(window.alert(msg)),
        success: (msg) => Promise.resolve(window.alert(msg)),
        error: (msg) => Promise.resolve(window.alert(msg)),
        confirm: (msg) => Promise.resolve(window.confirm(msg)),
        confirmDanger: (msg) => Promise.resolve(window.confirm(msg)),
    };

    let providers = [];

    const els = {};

    function bindEls() {
        [
            'providerNewBtn', 'providerModal', 'providerModalClose', 'providerCancelBtn',
            'providerForm', 'providerId', 'providerName', 'providerContact',
            'providerNif', 'providerPhone', 'providerEmail', 'providerNotes',
            'providerActive', 'providerFormTitle', 'providerFormMode', 'providerImpact',
            'providerSearch', 'providerList', 'providerStats',
        ].forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function getCookie(name) {
        return window.TpvUtils ? window.TpvUtils.getCookie(name) : null;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function providerPayload() {
        return {
            nombre: els.providerName.value.trim(),
            contacto: els.providerContact.value.trim(),
            nif: els.providerNif.value.trim(),
            telefono: els.providerPhone.value.trim(),
            email: els.providerEmail.value.trim(),
            notas: els.providerNotes.value.trim(),
            activo: els.providerActive.checked,
        };
    }

    function resetForm() {
        els.providerId.value = '';
        els.providerName.value = '';
        els.providerContact.value = '';
        els.providerNif.value = '';
        els.providerPhone.value = '';
        els.providerEmail.value = '';
        els.providerNotes.value = '';
        els.providerNotes.style.height = '';
        els.providerNotes.style.width = '';
        els.providerActive.checked = true;
        els.providerFormTitle.textContent = 'Nuevo proveedor';
        els.providerFormMode.textContent = 'Alta';
        els.providerImpact.classList.add('hidden');
        els.providerImpact.textContent = '';
    }

    function openProviderModal(provider) {
        resetForm();
        if (provider) {
            els.providerId.value = provider.id;
            els.providerName.value = provider.nombre || '';
            els.providerContact.value = provider.contacto || '';
            els.providerNif.value = provider.nif || '';
            els.providerPhone.value = provider.telefono || '';
            els.providerEmail.value = provider.email || '';
            els.providerNotes.value = provider.notas || '';
            els.providerActive.checked = provider.activo !== false;
            els.providerFormTitle.textContent = 'Editar proveedor';
            els.providerFormMode.textContent = `#${provider.id}`;
            const count = Number(provider.articulos_count || 0);
            if (count > 0) {
                els.providerImpact.textContent = `Este proveedor esta asignado a ${count} producto${count === 1 ? '' : 's'}. Al guardar, esos productos mantendran este proveedor; si cambias el nombre, se actualizara su referencia.`;
                els.providerImpact.classList.remove('hidden');
            }
        }

        els.providerModal.classList.remove('hidden');
        els.providerModal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => els.providerName.focus(), 0);
    }

    function closeProviderModal() {
        els.providerModal.classList.add('hidden');
        els.providerModal.setAttribute('aria-hidden', 'true');
        resetForm();
    }

    function providerMeta(provider) {
        return [
            provider.contacto ? `Persona: ${provider.contacto}` : '',
            provider.telefono ? `Tel: ${provider.telefono}` : '',
            provider.email || '',
            provider.nif ? `NIF/CIF: ${provider.nif}` : '',
            `${provider.articulos_count || 0} articulos`,
        ].filter(Boolean).join(' - ');
    }

    function filteredProviders() {
        const query = (els.providerSearch.value || '').trim().toLowerCase();
        if (!query) return providers;
        return providers.filter((provider) => {
            const haystack = [
                provider.nombre,
                provider.contacto,
                provider.telefono,
                provider.email,
                provider.nif,
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }

    function renderProviders() {
        const activos = providers.filter((provider) => provider.activo !== false).length;
        els.providerStats.textContent = `${providers.length} total - ${activos} activos`;

        const filtered = filteredProviders();
        if (filtered.length === 0) {
            els.providerList.innerHTML = '<div class="provider-empty">No hay proveedores.</div>';
            return;
        }

        els.providerList.innerHTML = filtered.map((provider) => {
            const inactive = provider.activo === false;
            return `
                <article class="provider-row ${inactive ? 'is-inactive' : ''}">
                    <div class="provider-row__main">
                        <div class="provider-row__title">
                            <strong title="${escapeHtml(provider.nombre)}">${escapeHtml(provider.nombre)}</strong>
                            <span class="provider-badge">${inactive ? 'Inactivo' : 'Activo'}</span>
                        </div>
                        <div class="provider-row__meta" title="${escapeHtml(providerMeta(provider))}">
                            ${escapeHtml(providerMeta(provider))}
                        </div>
                    </div>
                    <div class="provider-row__actions">
                        <button type="button" class="btn btn--mini" data-action="edit" data-id="${provider.id}">Editar</button>
                        <button type="button" class="btn btn--mini ${inactive ? 'btn--success' : 'btn--danger'}" data-action="toggle" data-id="${provider.id}" data-active="${inactive ? 'true' : 'false'}">
                            ${inactive ? 'Reactivar' : 'Desactivar'}
                        </button>
                        <button type="button" class="btn btn--mini btn--danger" data-action="delete" data-id="${provider.id}">Eliminar</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    async function loadProviders() {
        const resp = await fetch('/api/proveedores/');
        if (!resp.ok) {
            Notify.error('No se pudieron cargar los proveedores.');
            return;
        }
        providers = await resp.json();
        providers.sort((a, b) => {
            if (a.activo !== b.activo) return a.activo === false ? 1 : -1;
            return (a.nombre || '').localeCompare(b.nombre || '');
        });
        renderProviders();
    }

    function editProvider(id) {
        const provider = providers.find((item) => Number(item.id) === Number(id));
        if (!provider) return;
        openProviderModal(provider);
    }

    async function saveProvider(event) {
        event.preventDefault();

        const id = els.providerId.value;
        const payload = providerPayload();
        if (!payload.nombre) {
            Notify.info('El nombre del proveedor es obligatorio.');
            return;
        }

        const existing = providers.find((item) => Number(item.id) === Number(id));
        const linkedCount = Number(existing?.articulos_count || 0);
        if (existing && existing.activo !== false && payload.activo === false && linkedCount > 0) {
            const ok = await Notify.confirm(
                `Este proveedor tiene ${linkedCount} producto${linkedCount === 1 ? '' : 's'} asociado${linkedCount === 1 ? '' : 's'}. Al desactivarlo, seguiran vinculados, pero no se ofrecera para nuevas asignaciones.`,
                { title: 'Desactivar proveedor', confirmText: 'Desactivar' }
            );
            if (!ok) return;
        }

        const resp = await fetch(id ? `/api/proveedores/${id}/` : '/api/proveedores/', {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
            const firstError = data && typeof data === 'object'
                ? Object.values(data).flat().join('\n')
                : '';
            Notify.error(firstError || 'No se pudo guardar el proveedor.');
            return;
        }

        await loadProviders();
        closeProviderModal();
        Notify.success('Proveedor guardado.');
    }

    async function toggleProvider(id, active) {
        const provider = providers.find((item) => Number(item.id) === Number(id));
        const linkedCount = Number(provider?.articulos_count || 0);
        if (active === false && linkedCount > 0) {
            const ok = await Notify.confirm(
                `Este proveedor tiene ${linkedCount} producto${linkedCount === 1 ? '' : 's'} asociado${linkedCount === 1 ? '' : 's'}. Al desactivarlo, seguiran vinculados, pero no se ofrecera para nuevas asignaciones.`,
                { title: 'Desactivar proveedor', confirmText: 'Desactivar' }
            );
            if (!ok) return;
        }

        const resp = await fetch(`/api/proveedores/${id}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify({ activo: Boolean(active) }),
        });

        if (!resp.ok) {
            Notify.error('No se pudo actualizar el proveedor.');
            return;
        }

        await loadProviders();
        Notify.success(active ? 'Proveedor reactivado.' : 'Proveedor desactivado.');
    }

    function buildDeleteMessage(data) {
        const count = Number(data.articulos_count || 0);
        const articulos = Array.isArray(data.articulos) ? data.articulos : [];
        const items = articulos.slice(0, 12).map((articulo) => {
            const categoria = articulo.categoria ? ` <small>(${escapeHtml(articulo.categoria)})</small>` : '';
            return `<li>${escapeHtml(articulo.nombre)}${categoria}</li>`;
        }).join('');
        const hiddenCount = Math.max(count - Math.min(articulos.length, 12), 0);
        const more = data.truncated || hiddenCount > 0
            ? `<p><strong>Y ${hiddenCount} mas.</strong></p>`
            : '';

        return `
            <p>Este proveedor esta asignado a <strong>${count} producto${count === 1 ? '' : 's'}</strong>.</p>
            <p>Si lo eliminas, estos productos quedaran sin proveedor:</p>
            <ul>${items}</ul>
            ${more}
        `;
    }

    async function deleteProvider(id, confirmed = false) {
        const provider = providers.find((item) => Number(item.id) === Number(id));
        if (!confirmed && Number(provider?.articulos_count || 0) === 0) {
            const ok = await Notify.confirmDanger(
                `Se eliminara el proveedor "${provider?.nombre || ''}". Esta accion quedara registrada en auditoria.`,
                {
                    title: 'Eliminar proveedor',
                    confirmText: 'Eliminar proveedor',
                    cancelText: 'Cancelar',
                }
            );
            if (!ok) return;
        }

        const resp = await fetch(`/api/proveedores/${id}/${confirmed ? '?confirm=1' : ''}`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
        });

        if (resp.status === 409) {
            const data = await resp.json();
            const ok = await Notify.confirmDanger(buildDeleteMessage(data), {
                title: 'Eliminar proveedor',
                confirmText: 'Eliminar proveedor',
                cancelText: 'Cancelar',
                allowHtml: true,
            });
            if (ok) await deleteProvider(id, true);
            return;
        }

        if (!resp.ok) {
            const data = await resp.json().catch(() => null);
            Notify.error(data?.detail || 'No se pudo eliminar el proveedor.');
            return;
        }

        await loadProviders();
        Notify.success('Proveedor eliminado.');
    }

    function handleListClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const id = button.dataset.id;
        if (button.dataset.action === 'edit') {
            editProvider(id);
        } else if (button.dataset.action === 'toggle') {
            toggleProvider(id, button.dataset.active === 'true');
        } else if (button.dataset.action === 'delete') {
            deleteProvider(id);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindEls();
        els.providerForm.addEventListener('submit', saveProvider);
        els.providerNewBtn.addEventListener('click', () => openProviderModal());
        els.providerModalClose.addEventListener('click', closeProviderModal);
        els.providerCancelBtn.addEventListener('click', closeProviderModal);
        els.providerModal.addEventListener('click', (event) => {
            if (event.target === els.providerModal) closeProviderModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !els.providerModal.classList.contains('hidden')) {
                closeProviderModal();
            }
        });
        els.providerSearch.addEventListener('input', renderProviders);
        els.providerList.addEventListener('click', handleListClick);
        loadProviders();
    });
})();
