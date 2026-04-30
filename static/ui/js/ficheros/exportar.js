/* ============================================================
   EXPORTAR DATOS — Lógica JS
   ============================================================ */
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        initCustomSelect({
            triggerId: 'expProdDeptoTrigger',
            menuId: 'expProdDeptoOptions',
            inputId: 'expProdDepto',
            labelId: 'expProdDeptoLabel',
            defaultLabel: 'Todos los departamentos',
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.fich-custom-select')) closeAllCustomSelects();
        });
        window.addEventListener('resize', closeAllFloatingMenus);
        document.querySelector('.main')?.addEventListener('scroll', closeAllFloatingMenus, { passive: true });

        document.querySelectorAll('input[name="expProdEstado"], input[name="expProdEliminados"]').forEach((input) => {
            input.addEventListener('change', updateProductosSummary);
        });
        updateProductosSummary();

        await cargarDepartamentos();
    });

    async function cargarDepartamentos() {
        try {
            const resp = await fetch('/api/departamentos/');
            if (!resp.ok) return;
            const deptos = await resp.json();
            const options = document.getElementById('expProdDeptoOptions');
            if (!options) return;

            deptos.forEach((d) => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'fich-custom-select__option';
                opt.dataset.value = String(d.id);
                opt.textContent = d.nombre;
                options.appendChild(opt);
            });
        } catch (e) {
            console.error(e);
        }
    }

    function initCustomSelect({ triggerId, menuId, inputId, labelId, defaultLabel }) {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);
        const hiddenInput = document.getElementById(inputId);
        const labelEl = document.getElementById(labelId);
        if (!trigger || !menu || !hiddenInput || !labelEl) return;

        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = menu.classList.contains('hidden');
            closeAllCustomSelects();
            closeAllExportMenus();
            if (willOpen) {
                menu.classList.remove('hidden');
                trigger.setAttribute('aria-expanded', 'true');
                positionFloatingMenu(menu, trigger, { minWidth: 260 });
            }
            refreshFloatingCards();
        });

        menu.addEventListener('click', (event) => {
            const option = event.target.closest('.fich-custom-select__option');
            if (!option) return;
            const value = option.dataset.value || '';
            hiddenInput.value = value;
            labelEl.textContent = option.textContent || defaultLabel;
            menu.querySelectorAll('.fich-custom-select__option').forEach((opt) => {
                opt.classList.toggle('is-selected', (opt.dataset.value || '') === value);
            });
            closeAllCustomSelects();
        });
    }

    function closeAllCustomSelects() {
        document.querySelectorAll('.fich-custom-select__menu').forEach((menu) => {
            menu.classList.add('hidden');
            clearFloatingPosition(menu);
        });
        document.querySelectorAll('.fich-custom-select__trigger').forEach((trigger) => {
            trigger.setAttribute('aria-expanded', 'false');
        });
        refreshFloatingCards();
    }

    function closeAllExportMenus() {
        if (window.FichExportMenu) {
            window.FichExportMenu.closeAll();
            return;
        }
        document.querySelectorAll('.fich-export__menu').forEach((menu) => {
            menu.classList.add('hidden');
            clearFloatingPosition(menu);
        });
        refreshFloatingCards();
    }

    function closeAllFloatingMenus() {
        closeAllCustomSelects();
        closeAllExportMenus();
    }

    function refreshFloatingCards() {
        document.querySelectorAll('.fich-card--export').forEach((card) => {
            const hasOpenSelect = card.querySelector('.fich-custom-select__menu:not(.hidden)');
            const hasOpenExport = card.querySelector('.fich-export__menu:not(.hidden)');
            const hasOpenMenu = hasOpenSelect || hasOpenExport;
            card.classList.toggle('is-floating-open', Boolean(hasOpenMenu));
            card.classList.toggle('is-custom-select-open', Boolean(hasOpenSelect));
            card.classList.toggle('is-export-menu-open', Boolean(hasOpenExport));
        });
    }

    function positionFloatingMenu(menu, anchor, { alignRight = false, minWidth = 0 } = {}) {
        const rect = anchor.getBoundingClientRect();
        const viewportPadding = 12;
        const gap = 8;
        const width = Math.max(rect.width, minWidth);
        const left = alignRight
            ? Math.min(window.innerWidth - width - viewportPadding, Math.max(viewportPadding, rect.right - width))
            : Math.min(window.innerWidth - width - viewportPadding, Math.max(viewportPadding, rect.left));
        const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
        const menuHeight = Math.min(menu.scrollHeight || 280, 280);
        const openUp = availableBelow < Math.min(menuHeight, 180) && rect.top > availableBelow;
        const top = openUp
            ? Math.max(viewportPadding, rect.top - menuHeight - gap)
            : Math.min(window.innerHeight - viewportPadding - 40, rect.bottom + gap);

        menu.classList.add('is-floating-layer');
        menu.style.position = 'fixed';
        menu.style.zIndex = '4000';
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.setProperty('--floating-left', `${left}px`);
        menu.style.setProperty('--floating-top', `${top}px`);
        menu.style.setProperty('--floating-width', `${width}px`);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.width = `${width}px`;
        menu.style.maxHeight = openUp
            ? `${Math.max(160, rect.top - viewportPadding - gap)}px`
            : `${Math.max(160, availableBelow)}px`;
    }

    function clearFloatingPosition(menu) {
        menu.classList.remove('is-floating-layer');
        menu.style.position = '';
        menu.style.zIndex = '';
        menu.style.right = '';
        menu.style.bottom = '';
        menu.style.left = '';
        menu.style.top = '';
        menu.style.width = '';
        menu.style.removeProperty('--floating-left');
        menu.style.removeProperty('--floating-top');
        menu.style.removeProperty('--floating-width');
        menu.style.maxHeight = '';
    }

    function selectedValue(name) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : '';
    }

    function buildProductosUrl(formato) {
        const estado = selectedValue('expProdEstado') || 'active';
        const eliminados = selectedValue('expProdEliminados') || 'exclude';
        const depto = document.getElementById('expProdDepto')?.value || '';

        let url = `/api/ficheros/exportar-productos/?format=${encodeURIComponent(formato)}`;
        url += `&estado=${encodeURIComponent(estado)}`;
        url += `&eliminados=${encodeURIComponent(eliminados)}`;
        if (depto) url += `&departamento=${encodeURIComponent(depto)}`;
        return url;
    }

    function updateProductosSummary() {
        const summary = document.getElementById('expProdSummary');
        if (!summary) return;

        const estado = selectedValue('expProdEstado') || 'active';
        const eliminados = selectedValue('expProdEliminados') || 'exclude';

        const estadoText = {
            active: 'activos',
            inactive: 'inactivos',
            all: 'activos e inactivos',
        }[estado];
        const eliminadoText = {
            exclude: 'sin eliminados',
            include: 'incluyendo eliminados',
            only: 'solo eliminados',
        }[eliminados];

        summary.textContent = `Se exportarán productos ${estadoText}, ${eliminadoText}.`;
    }

    function buildInventarioUrl(formato) {
        return `/api/ficheros/exportar-inventario/?format=${encodeURIComponent(formato)}`;
    }

    window.exportarProductosFormato = async (event, formato) => {
        event.stopPropagation();
        closeAllExportMenus();
        if (formato === 'pdf') {
            await descargarPDF({
                title: 'Productos del catálogo',
                url: buildProductosUrl('json'),
                landscape: true,
            });
            return;
        }
        window.location.href = buildProductosUrl(formato);
    };

    window.exportarInventarioFormato = async (event, formato) => {
        event.stopPropagation();
        closeAllExportMenus();
        if (formato === 'pdf') {
            await descargarPDF({
                title: 'Artículos de inventario',
                url: buildInventarioUrl('json'),
                landscape: true,
            });
            return;
        }
        window.location.href = buildInventarioUrl(formato);
    };

    async function descargarPDF({ title, url, landscape }) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            if (window.Notify) await Notify.error('El navegador ha bloqueado la ventana de PDF.');
            return;
        }

        printWindow.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${esc(title)} - TPV</title>
                <style>
                    body { margin: 22px; font-family: Arial, sans-serif; color: #172033; }
                    .loading { min-height: 180px; display:flex; align-items:center; justify-content:center; color:#566174; font-size:14px; }
                </style>
            </head>
            <body><div class="loading">Preparando PDF...</div></body>
            </html>
        `);
        printWindow.document.close();

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Error al obtener datos');
            const data = await resp.json();
            const rows = data.rows || [];
            const headers = data.headers || [];

            if (!rows.length) {
                if (window.Notify) await Notify.info('No hay datos para exportar con el filtro seleccionado.');
                printWindow.close();
                return;
            }

            const tableHtml = buildPrintTable(headers, rows);
            const generatedAt = new Date().toLocaleString('es-ES');
            printWindow.document.open();
            printWindow.document.write(`
                <!doctype html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${esc(title)} - TPV</title>
                    <style>
                        body { margin: 22px; font-family: Arial, sans-serif; color: #172033; }
                        .head { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; border-bottom:3px solid #172033; padding-bottom:12px; }
                        h1 { margin:0; font-size:26px; }
                        .meta { color:#566174; font-size:12px; text-align:right; }
                        table { width:100%; border-collapse:collapse; margin-top:18px; font-size:11px; }
                        th { background:#eef2f7; color:#172033; text-transform:uppercase; font-size:10px; letter-spacing:.04em; text-align:left; padding:8px; border-bottom:2px solid #c7d0dd; }
                        td { padding:7px 8px; border-bottom:1px solid #d8dee8; vertical-align:top; }
                        tr:nth-child(even) td { background:#fafbfc; }
                        @media print {
                            @page { margin: 10mm; size: ${landscape ? 'landscape' : 'portrait'}; }
                            body { margin:0; }
                        }
                    </style>
                </head>
                <body onload="setTimeout(function(){ window.print(); window.close(); }, 500);">
                    <div class="head">
                        <h1>${esc(title)}</h1>
                        <div class="meta">TPV Hostelería<br>Generado: ${esc(generatedAt)}</div>
                    </div>
                    ${tableHtml}
                </body>
                </html>
            `);
            printWindow.document.close();
        } catch (e) {
            console.error(e);
            printWindow.close();
            if (window.Notify) await Notify.error('No se pudo generar el PDF.');
        }
    }

    function buildPrintTable(headers, rows) {
        let html = '<table><thead><tr>';
        headers.forEach((h) => {
            html += `<th>${esc(h)}</th>`;
        });
        html += '</tr></thead><tbody>';
        rows.forEach((row) => {
            html += '<tr>';
            row.forEach((cell) => {
                html += `<td>${esc(cell ?? '')}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
