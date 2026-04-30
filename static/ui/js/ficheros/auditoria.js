/* ============================================================
   AUDITORIA - Logica JS
   ============================================================ */
(function () {
    let currentPage = 1;
    const PER_PAGE = 30;
    const Notify = window.Notify;

    let auditStartDateCache = null;
    let auditDesdeController = null;
    let auditHastaController = null;
    let applyingPreset = false;

    document.addEventListener('DOMContentLoaded', async () => {
        initCustomSelect({
            triggerId: 'auditUsuarioTrigger',
            menuId: 'auditUsuarioOptions',
            inputId: 'auditUsuario',
            labelId: 'auditUsuarioLabel',
            defaultLabel: 'Todos los usuarios',
            onChange: () => cargarAuditoria(),
        });

        initCustomSelect({
            triggerId: 'auditEventoTrigger',
            menuId: 'auditEventoOptions',
            inputId: 'auditEvento',
            labelId: 'auditEventoLabel',
            defaultLabel: 'Todos los eventos',
            onChange: () => cargarAuditoria(),
        });

        auditDesdeController = window.createFicherosDateField('auditDesde', {
            pickerId: 'auditDesdePicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });
        auditHastaController = window.createFicherosDateField('auditHasta', {
            pickerId: 'auditHastaPicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });

        const onDateFixed = async () => {
            if (applyingPreset) return;
            setActivePreset(null);
            await cargarAuditoria();
        };
        document.getElementById('auditDesde').addEventListener('date-fixed', onDateFixed);
        document.getElementById('auditHasta').addEventListener('date-fixed', onDateFixed);

        await Promise.all([cargarUsuarios(), cargarEventos()]);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.fich-custom-select')) closeAllCustomSelects();
            if (!e.target.closest('.fich-export')) closeAllExportMenus();
        });

        await window.setAuditPreset('todo');
    });

    function initCustomSelect({ triggerId, menuId, inputId, labelId, defaultLabel, onChange }) {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);
        const hiddenInput = document.getElementById(inputId);
        const labelEl = document.getElementById(labelId);
        if (!trigger || !menu || !hiddenInput || !labelEl) return;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = menu.classList.contains('hidden');
            closeAllCustomSelects();
            if (willOpen) {
                menu.classList.remove('hidden');
                trigger.setAttribute('aria-expanded', 'true');
            }
        });

        menu.addEventListener('click', (e) => {
            const option = e.target.closest('.fich-custom-select__option');
            if (!option) return;
            const value = option.dataset.value || '';
            const label = option.textContent || defaultLabel;
            hiddenInput.value = value;
            labelEl.textContent = label;
            menu.querySelectorAll('.fich-custom-select__option').forEach((opt) => {
                opt.classList.toggle('is-selected', (opt.dataset.value || '') === value);
            });
            menu.classList.add('hidden');
            trigger.setAttribute('aria-expanded', 'false');
            if (onChange) onChange();
        });
    }

    function closeAllCustomSelects() {
        document.querySelectorAll('.fich-custom-select__menu').forEach((menu) => {
            menu.classList.add('hidden');
        });
        document.querySelectorAll('.fich-custom-select__trigger').forEach((trigger) => {
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    async function cargarUsuarios() {
        try {
            const resp = await fetch('/api/ficheros/auditoria/usuarios/');
            if (!resp.ok) return;
            const users = await resp.json();
            const options = document.getElementById('auditUsuarioOptions');
            if (!options) return;
            users.forEach((u) => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'fich-custom-select__option';
                opt.dataset.value = String(u.id);
                opt.textContent = u.username;
                options.appendChild(opt);
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function cargarEventos() {
        try {
            const resp = await fetch('/api/ficheros/auditoria/eventos/');
            if (!resp.ok) return;
            const eventos = await resp.json();
            const options = document.getElementById('auditEventoOptions');
            if (!options) return;
            eventos.forEach((ev) => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'fich-custom-select__option';
                opt.dataset.value = ev;
                opt.textContent = ev;
                options.appendChild(opt);
            });
        } catch (e) {
            console.error(e);
        }
    }

    function getFiltrosAuditoria() {
        const search = document.getElementById('auditSearch').value;
        const usuario = document.getElementById('auditUsuario').value;
        const evento = document.getElementById('auditEvento').value;
        const desde = auditDesdeController ? auditDesdeController.getIsoValue() : '';
        const hasta = auditHastaController ? auditHastaController.getIsoValue() : '';
        const desdeRaw = auditDesdeController ? auditDesdeController.getDisplayValueIfValid() : '';
        const hastaRaw = auditHastaController ? auditHastaController.getDisplayValueIfValid() : '';
        return { search, usuario, evento, desde, hasta, desdeRaw, hastaRaw };
    }

    window.cargarAuditoria = async (page) => {
        if (page) currentPage = page;
        else currentPage = 1;

        const { search, usuario, evento, desde, hasta } = getFiltrosAuditoria();
        let url = `/api/ficheros/auditoria/?page=${currentPage}&per_page=${PER_PAGE}`;
        if (search) url += `&q=${encodeURIComponent(search)}`;
        if (usuario) url += `&usuario=${encodeURIComponent(usuario)}`;
        if (evento) url += `&evento=${encodeURIComponent(evento)}`;
        if (desde) url += `&desde=${encodeURIComponent(desde)}`;
        if (hasta) url += `&hasta=${encodeURIComponent(hasta)}`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();
            renderAuditoria(data);
        } catch (e) {
            document.getElementById('auditBody').innerHTML =
                '<tr><td colspan="4" class="fich-empty-cell">Error al cargar datos</td></tr>';
        }
    };

    function renderAuditoria(data) {
        const tbody = document.getElementById('auditBody');
        if (!data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="fich-empty-cell">No hay registros de auditoria</td></tr>';
            document.getElementById('auditPagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.items.map((item) => `
            <tr>
                <td>${esc(item.fecha)}</td>
                <td>${esc(item.usuario || '-')}</td>
                <td><strong>${esc(item.evento)}</strong></td>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(item.detalles)}">${esc(item.detalles || '-')}</td>
            </tr>
        `).join('');

        const totalPages = data.total_pages || 1;
        const pagEl = document.getElementById('auditPagination');
        let html = '';
        if (totalPages > 1) {
            for (let p = 1; p <= totalPages; p++) {
                html += `<button class="fich-page-btn ${p === currentPage ? 'active' : ''}" onclick="cargarAuditoria(${p})">${p}</button>`;
            }
        }
        pagEl.innerHTML = html;
    }

    function closeAllExportMenus() {
        if (window.FichExportMenu) window.FichExportMenu.closeAll();
        else document.querySelectorAll('.fich-export__menu').forEach((menu) => menu.classList.add('hidden'));
    }

    function buildAuditExportUrl(formato) {
        const { search, usuario, evento, desde, hasta } = getFiltrosAuditoria();
        let url = `/api/ficheros/auditoria/exportar/?format=${encodeURIComponent(formato)}`;
        if (search) url += `&q=${encodeURIComponent(search)}`;
        if (usuario) url += `&usuario=${encodeURIComponent(usuario)}`;
        if (evento) url += `&evento=${encodeURIComponent(evento)}`;
        if (desde) url += `&desde=${encodeURIComponent(desde)}`;
        if (hasta) url += `&hasta=${encodeURIComponent(hasta)}`;
        return url;
    }

    window.exportarAuditoriaFormato = async (event, formato) => {
        event.stopPropagation();
        closeAllExportMenus();
        if (formato === 'pdf') {
            await descargarAuditoriaPDF();
            return;
        }
        window.location.href = buildAuditExportUrl(formato);
    };

    async function descargarAuditoriaPDF() {
        const url = buildAuditExportUrl('json');
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Error al obtener datos');
            const data = await resp.json();
            const rows = data.rows || [];
            if (!rows.length) {
                await Notify.info('No hay registros de auditoria en el filtro seleccionado.');
                return;
            }

            const headers = data.headers || ['Fecha', 'Usuario', 'Evento', 'Detalles'];
            let tableHtml = '<table style="width:100%; border-collapse:collapse; font-family:sans-serif; font-size:12px; margin-top:20px; color:#333;">';
            tableHtml += '<thead><tr>';
            headers.forEach((h) => {
                tableHtml += `<th style="border-bottom:2px solid #aaa; padding:8px; background:#f7f7f7; text-align:left; text-transform:uppercase;">${esc(h)}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';
            rows.forEach((row) => {
                tableHtml += '<tr>';
                row.forEach((cell) => {
                    tableHtml += `<td style="border-bottom:1px solid #ddd; padding:7px 8px;">${esc(cell || '')}</td>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table>';

            const { desdeRaw, hastaRaw } = getFiltrosAuditoria();
            const rango = (desdeRaw || hastaRaw) ? `Rango: ${desdeRaw || '-'} - ${hastaRaw || '-'}` : '';

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Auditoria - TPV</title>
                    <style>
                        body { margin: 20px; font-family: sans-serif; }
                        @media print {
                            @page { margin: 10mm; size: landscape; }
                            body { margin: 0; }
                        }
                    </style>
                </head>
                <body onload="setTimeout(function(){ window.print(); window.close(); }, 500);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #333; padding-bottom:10px;">
                        <h1 style="margin:0;">Auditoria</h1>
                        <span style="font-size:14px; color:#555;">${esc(rango)}</span>
                    </div>
                    ${tableHtml}
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (e) {
            console.error(e);
            await Notify.error('No se pudo generar el PDF.');
        }
    }

    function setActivePreset(preset) {
        document.querySelectorAll('.fich-preset-btn').forEach((btn) => {
            const isActive = btn.dataset.preset === preset;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function shiftMonths(date, months) {
        const day = date.getDate();
        const base = new Date(date.getFullYear(), date.getMonth() + months, 1);
        const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        return new Date(base.getFullYear(), base.getMonth(), Math.min(day, maxDay));
    }

    function shiftYears(date, years) {
        return shiftMonths(date, years * 12);
    }

    async function getAuditStartDate() {
        if (auditStartDateCache) return auditStartDateCache;
        try {
            const resp = await fetch('/api/ficheros/auditoria/rango/');
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data || !data.min_date) return null;
            const parsed = new Date(`${data.min_date}T00:00:00`);
            if (Number.isNaN(parsed.getTime())) return null;
            auditStartDateCache = parsed;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    window.setAuditPreset = async (preset) => {
        if (!auditDesdeController || !auditHastaController) return;

        const hoy = new Date();
        let desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

        switch (preset) {
            case 'hoy':
                break;
            case 'semana':
                desde = new Date(hoy.getTime() - (6 * 86400000));
                break;
            case 'mes':
                desde = shiftMonths(hoy, -1);
                break;
            case 'anio':
                desde = shiftYears(hoy, -1);
                break;
            case 'todo': {
                const start = await getAuditStartDate();
                if (start) desde = start;
                break;
            }
            default:
                break;
        }

        applyingPreset = true;
        auditDesdeController.setDate(desde, { silent: true });
        auditHastaController.setDate(hoy, { silent: true });
        setActivePreset(preset);
        applyingPreset = false;

        await cargarAuditoria();
    };

    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
})();
