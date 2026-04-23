/* ============================================================
   LOGS DEL SISTEMA - Logica JS
   ============================================================ */
(function () {
    let currentPage = 1;
    const PER_PAGE = 30;

    let logsStartDateCache = null;
    let logDesdeController = null;
    let logHastaController = null;
    let applyingPreset = false;

    function getCookie(name) {
        let v = null;
        document.cookie.split(';').forEach((c) => {
            const [k, val] = c.trim().split('=');
            if (k === name) v = decodeURIComponent(val);
        });
        return v;
    }

    function setActivePreset(preset) {
        document.querySelectorAll('.fich-preset-btn').forEach((btn) => {
            const isActive = btn.dataset.preset === preset;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function shiftMonths(date, months) {
        if (window.ficherosShiftMonths) return window.ficherosShiftMonths(date, months);
        const day = date.getDate();
        const base = new Date(date.getFullYear(), date.getMonth() + months, 1);
        const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        return new Date(base.getFullYear(), base.getMonth(), Math.min(day, maxDay));
    }

    function shiftYears(date, years) {
        if (window.ficherosShiftYears) return window.ficherosShiftYears(date, years);
        return shiftMonths(date, years * 12);
    }

    async function getLogsStartDate() {
        if (logsStartDateCache) return logsStartDateCache;
        try {
            const resp = await fetch('/api/ficheros/logs/rango/');
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data || !data.min_date) return null;
            const parsed = new Date(`${data.min_date}T00:00:00`);
            if (Number.isNaN(parsed.getTime())) return null;
            logsStartDateCache = parsed;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    async function cargarOrigenes() {
        const select = document.getElementById('logOrigen');
        if (!select) return;
        try {
            const resp = await fetch('/api/ficheros/logs/origenes/');
            if (!resp.ok) return;
            const origenes = await resp.json();
            origenes.forEach((origen) => {
                const opt = document.createElement('option');
                opt.value = origen;
                opt.textContent = origen;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error(e);
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        logDesdeController = window.createFicherosDateField('logDesde', {
            pickerId: 'logDesdePicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });
        logHastaController = window.createFicherosDateField('logHasta', {
            pickerId: 'logHastaPicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });

        const onDateFixed = () => {
            if (!applyingPreset) setActivePreset(null);
            cargarLogs();
        };
        document.getElementById('logDesde').addEventListener('date-fixed', onDateFixed);
        document.getElementById('logHasta').addEventListener('date-fixed', onDateFixed);

        await cargarOrigenes();
        await window.setLogPreset('todo');
    });

    function getLogFilters() {
        const search = document.getElementById('logSearch').value;
        const nivel = document.getElementById('logNivel').value;
        const origenEl = document.getElementById('logOrigen');
        const origen = origenEl ? origenEl.value : '';
        const desde = logDesdeController ? logDesdeController.getIsoValue() : '';
        const hasta = logHastaController ? logHastaController.getIsoValue() : '';
        return { search, nivel, origen, desde, hasta };
    }

    window.setLogPreset = async (preset) => {
        if (!logDesdeController || !logHastaController) return;

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
                const start = await getLogsStartDate();
                if (start) desde = start;
                break;
            }
            default:
                break;
        }

        applyingPreset = true;
        logDesdeController.setDate(desde, { silent: true });
        logHastaController.setDate(hoy, { silent: true });
        setActivePreset(preset);
        applyingPreset = false;

        await cargarLogs();
    };

    window.cargarLogs = async (page) => {
        if (page) currentPage = page;
        else currentPage = 1;

        const { search, nivel, origen, desde, hasta } = getLogFilters();

        let url = `/api/ficheros/logs/?page=${currentPage}&per_page=${PER_PAGE}`;
        if (search) url += `&q=${encodeURIComponent(search)}`;
        if (nivel) url += `&nivel=${nivel}`;
        if (origen) url += `&origen=${encodeURIComponent(origen)}`;
        if (desde) url += `&desde=${desde}`;
        if (hasta) url += `&hasta=${hasta}`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();
            renderLogs(data);
        } catch (e) {
            document.getElementById('logBody').innerHTML =
                '<tr><td colspan="4" class="fich-empty-cell">Error al cargar logs</td></tr>';
        }
    };

    function renderLogs(data) {
        const tbody = document.getElementById('logBody');

        if (!data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="fich-empty-cell">No hay logs registrados</td></tr>';
            document.getElementById('logPagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = data.items.map((item) => {
            const hasTrace = item.traza && item.traza.length > 0;
            const clickAttr = hasTrace
                ? `style="cursor:pointer" onclick="verTraza(${item.id})" title="Ver traza completa"`
                : '';
            return `
                <tr ${clickAttr}>
                    <td>${esc(item.fecha)}</td>
                    <td><span class="fich-level-pill fich-level-${esc(item.nivel)}">${esc(item.nivel)}</span></td>
                    <td>${esc(item.origen)}</td>
                    <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(item.mensaje)}">${esc(item.mensaje)}</td>
                </tr>
            `;
        }).join('');

        const totalPages = data.total_pages || 1;
        const pagEl = document.getElementById('logPagination');
        let html = '';
        if (totalPages > 1) {
            for (let p = 1; p <= totalPages; p++) {
                html += `<button class="fich-page-btn ${p === currentPage ? 'active' : ''}" onclick="cargarLogs(${p})">${p}</button>`;
            }
        }
        pagEl.innerHTML = html;
    }

    window.verTraza = async (id) => {
        try {
            const resp = await fetch(`/api/ficheros/logs/${id}/`);
            const data = await resp.json();
            document.getElementById('logDetalleTitle').textContent = `[${data.nivel}] ${data.origen}`;
            document.getElementById('logDetalleTraza').textContent = data.traza || data.mensaje;
            document.getElementById('modalLogDetalle').classList.remove('hidden');
        } catch (e) {
            await Notify.error('Error al cargar detalle');
        }
    };

    window.exportarLogs = () => {
        const { search, nivel, origen, desde, hasta } = getLogFilters();

        let url = '/api/ficheros/logs/exportar/?format=csv';
        if (search) url += `&q=${encodeURIComponent(search)}`;
        if (nivel) url += `&nivel=${nivel}`;
        if (origen) url += `&origen=${encodeURIComponent(origen)}`;
        if (desde) url += `&desde=${desde}`;
        if (hasta) url += `&hasta=${hasta}`;

        window.location.href = url;
    };

    window.limpiarLogsAntiguos = async () => {
        const ok = await Notify.confirmDanger(
            'Eliminar todos los logs de mas de 30 dias de antiguedad?',
            { title: 'Limpiar logs' }
        );
        if (!ok) return;
        try {
            const resp = await fetch('/api/ficheros/logs/limpiar/', {
                method: 'POST',
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
            });
            const data = await resp.json();
            if (data.ok) {
                await Notify.info(`${data.eliminados} logs eliminados`, { title: 'Logs' });
                cargarLogs();
            } else {
                await Notify.error(`Error: ${data.error}`);
            }
        } catch (e) {
            await Notify.error('Error de conexion');
        }
    };

    function esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
})();
