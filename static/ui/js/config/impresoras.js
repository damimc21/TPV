(function () {
    'use strict';

    const Notify = window.Notify;
    const UI = window.UI;
    const { jsonHeaders, csrfHeaders } = window.TpvUtils;

    // ==========================================
    // Modal Añadir / Editar
    // ==========================================
    window.openModalImpresora = function (id, nombre, tipo, ip_o_puerto, papel_mm, activa) {
        const esEdicion = id !== undefined && id !== null && id !== '';

        document.getElementById('formImpresora')?.reset();
        document.getElementById('imp_id').value = esEdicion ? id : '';
        document.getElementById('imp_nombre').value = esEdicion ? (nombre || '') : '';
        document.getElementById('imp_tipo').value = esEdicion ? (tipo || 'caja') : 'caja';
        document.getElementById('imp_papel_mm').value = esEdicion ? (papel_mm ?? 80) : 80;
        document.getElementById('imp_ip_o_puerto').value = esEdicion ? (ip_o_puerto || '') : '';
        document.getElementById('imp_activa').checked = esEdicion ? !!activa : true;

        document.getElementById('modalImpresoraTitle').innerText = esEdicion
            ? 'Editar Impresora'
            : 'Nueva Impresora';

        document.getElementById('modalImpresora')?.classList.remove('hidden');
        document.getElementById('imp_nombre')?.focus();
    };

    window.closeModal = function (modalId) {
        document.getElementById(modalId)?.classList.add('hidden');
    };

    async function saveImpresora() {
        const id = document.getElementById('imp_id').value;
        const nombre = document.getElementById('imp_nombre').value.trim();
        const tipo = document.getElementById('imp_tipo').value;
        const papel_mm = parseInt(document.getElementById('imp_papel_mm').value, 10) || 80;
        const ip_o_puerto = document.getElementById('imp_ip_o_puerto').value.trim();
        const activa = document.getElementById('imp_activa').checked;

        if (!nombre) {
            Notify.info('El nombre es obligatorio');
            return;
        }

        const payload = { nombre, tipo, papel_mm, ip_o_puerto, activa };

        try {
            const resp = await fetch(id ? `/api/impresoras/${id}/` : '/api/impresoras/', {
                method: id ? 'PUT' : 'POST',
                headers: jsonHeaders(),
                body: JSON.stringify(payload),
            });

            if (resp.ok) {
                window.closeModal('modalImpresora');
                location.reload();
            } else {
                const data = await resp.json().catch(() => null);
                const msg = data ? Object.values(data).flat().join(' ') : null;
                Notify.error(msg || 'Error al guardar la impresora');
            }
        } catch (err) {
            console.error(err);
            Notify.error('Error al guardar la impresora');
        }
    }

    // ==========================================
    // Eliminar
    // ==========================================
    window.deleteImpresora = async function (id, nombre) {
        const confirmed = await Notify.confirmDanger(
            `¿Seguro que deseas eliminar la impresora "${nombre}"?`,
            { title: 'Eliminar Impresora' }
        );
        if (!confirmed) return;

        try {
            const resp = await fetch(`/api/impresoras/${id}/`, {
                method: 'DELETE',
                headers: csrfHeaders(),
            });
            if (resp.ok) {
                location.reload();
            } else {
                Notify.error('Error al eliminar la impresora');
            }
        } catch (err) {
            console.error(err);
            Notify.error('Error al eliminar la impresora');
        }
    };

    // ==========================================
    // Sembrar impresoras por defecto (Cocina / Barra / Caja)
    // ==========================================
    window.seedImpresorasPorDefecto = async function () {
        const defaults = [
            { nombre: 'Cocina', tipo: 'cocina', papel_mm: 80, ip_o_puerto: '', activa: true },
            { nombre: 'Barra', tipo: 'barra', papel_mm: 80, ip_o_puerto: '', activa: true },
            { nombre: 'Caja', tipo: 'caja', papel_mm: 80, ip_o_puerto: '', activa: true },
        ];

        try {
            const resp = await fetch('/api/impresoras/');
            const existentes = resp.ok ? await resp.json() : [];
            const nombresExistentes = new Set(
                (existentes || []).map((i) => (i.nombre || '').trim().toLowerCase())
            );

            const faltantes = defaults.filter((p) => !nombresExistentes.has(p.nombre.toLowerCase()));

            if (faltantes.length === 0) {
                Notify.info('Cocina, Barra y Caja ya están creadas.');
                return;
            }

            const nombresFaltantes = faltantes.map((p) => p.nombre).join(', ');
            const confirmed = await Notify.confirm(
                `Se crearán las impresoras por defecto que faltan: ${nombresFaltantes}. ¿Continuar?`,
                { title: 'Crear impresoras por defecto' }
            );
            if (!confirmed) return;

            const results = await Promise.all(faltantes.map((p) => fetch('/api/impresoras/', {
                method: 'POST',
                headers: jsonHeaders(),
                body: JSON.stringify(p),
            })));

            const fallidas = results.filter((r) => !r.ok).length;
            if (fallidas > 0) {
                Notify.warning(`Se crearon ${results.length - fallidas} de ${results.length} impresoras.`);
            }
            location.reload();
        } catch (err) {
            console.error(err);
            Notify.error('Error al crear las impresoras por defecto');
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        document.getElementById('btnGuardarImpresora')?.addEventListener('click', saveImpresora);
    });
})();
