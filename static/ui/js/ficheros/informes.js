/* ============================================================
   INFORMES - Logica JS
   ============================================================ */
(function () {
    const todoStartCache = new Map();
    const todoStartRequestCache = new Map();
    const Notify = window.Notify;

    let informeDesdeController = null;
    let informeHastaController = null;
    let applyingPreset = false;

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

    function formatDateES(date) {
        if (window.ficherosFormatDateDisplay) return window.ficherosFormatDateDisplay(date);
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    }

    async function getNoDataMessage(tipo) {
        const start = await getTodoStartDate(tipo);
        if (!start) return 'No hay datos en el rango seleccionado.';
        return `No hay datos en el rango seleccionado.\nHay registros desde el ${formatDateES(start)}.`;
    }

    async function getTodoStartDate(tipo = null) {
        const key = tipo || '__all__';
        if (todoStartCache.has(key)) return todoStartCache.get(key);
        if (todoStartRequestCache.has(key)) return todoStartRequestCache.get(key);

        const qs = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';
        const requestPromise = fetch(`/api/ficheros/informes/rango/${qs}`)
            .then((resp) => (resp.ok ? resp.json() : null))
            .then((data) => {
                const iso = data && data.min_date ? data.min_date : null;
                if (!iso) return null;
                const parsed = new Date(`${iso}T00:00:00`);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            })
            .catch(() => null)
            .finally(() => {
                todoStartRequestCache.delete(key);
            });

        todoStartRequestCache.set(key, requestPromise);
        const resolved = await requestPromise;
        todoStartCache.set(key, resolved);
        return resolved;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        informeDesdeController = window.createFicherosDateField('informeDesde', {
            pickerId: 'informeDesdePicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });
        informeHastaController = window.createFicherosDateField('informeHasta', {
            pickerId: 'informeHastaPicker',
            onDirty: () => {
                if (!applyingPreset) setActivePreset(null);
            },
        });

        const onDateFixed = () => {
            if (!applyingPreset) setActivePreset(null);
        };
        document.getElementById('informeDesde').addEventListener('date-fixed', onDateFixed);
        document.getElementById('informeHasta').addEventListener('date-fixed', onDateFixed);

        await window.setPreset('mes');
    });

    window.setPreset = async (preset) => {
        if (!informeDesdeController || !informeHastaController) return;

        const hoy = new Date();
        let desde;

        switch (preset) {
            case 'hoy':
                desde = hoy;
                break;
            case 'semana':
                desde = new Date(hoy.getTime() - 6 * 86400000);
                break;
            case 'mes':
                desde = shiftMonths(hoy, -1);
                break;
            case 'anio':
                desde = shiftYears(hoy, -1);
                break;
            case 'todo':
                desde = await getTodoStartDate();
                if (!desde) desde = hoy;
                break;
            default:
                desde = hoy;
                break;
        }

        applyingPreset = true;
        informeDesdeController.setDate(desde, { silent: true });
        informeHastaController.setDate(hoy, { silent: true });
        setActivePreset(preset);
        applyingPreset = false;
    };

    function getParams() {
        const desde = informeDesdeController ? informeDesdeController.getIsoValue() : '';
        const hasta = informeHastaController ? informeHastaController.getIsoValue() : '';
        return { desde, hasta };
    }

    function closeAllExportMenus() {
        if (window.FichExportMenu) window.FichExportMenu.closeAll();
        else document.querySelectorAll('.fich-export__menu').forEach((menu) => menu.classList.add('hidden'));
    }

    window.descargarInforme = (tipo, formato = 'csv') => {
        const { desde, hasta } = getParams();
        window.location.href = `/api/ficheros/exportar-informe/${tipo}/?desde=${desde}&hasta=${hasta}&format=${formato}`;
    };

    window.exportarInformeFormato = async (event, tipo, titulo, formato) => {
        event.stopPropagation();
        closeAllExportMenus();

        const data = await fetchInformeJSON(tipo);
        if (!data || !data.rows || data.rows.length === 0) {
            await Notify.info(await getNoDataMessage(tipo));
            return;
        }

        if (formato === 'pdf') {
            window.descargarPDF(tipo, titulo);
            return;
        }
        window.descargarInforme(tipo, formato);
    };

    async function fetchInformeJSON(tipo) {
        const { desde, hasta } = getParams();
        try {
            const resp = await fetch(`/api/ficheros/exportar-informe/${tipo}/?desde=${desde}&hasta=${hasta}&format=json`);
            if (resp.ok) return await resp.json();
            console.error('Error al obtener el informe.');
        } catch (e) {
            console.error('Fetch error:', e);
        }
        return null;
    }

    window.descargarPDF = async (tipo, titulo) => {
        const data = await fetchInformeJSON(tipo);
        if (!data || !data.rows || data.rows.length === 0) {
            await Notify.info(await getNoDataMessage(tipo));
            return;
        }

        let tableHtml = '<table style="width:100%; border-collapse:collapse; font-family:sans-serif; font-size:13px; margin-top:20px; color:#333;">';
        tableHtml += '<thead><tr>';
        data.headers.forEach((h) => {
            tableHtml += `<th style="border-bottom:2px solid #aaa; padding:10px; background-color:#f7f7f7; text-align:left; text-transform:uppercase;">${h}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        data.rows.forEach((r) => {
            tableHtml += '<tr>';
            r.forEach((cell) => {
                tableHtml += `<td style="border-bottom:1px solid #ddd; padding:8px 10px;">${cell}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';

        const d = informeDesdeController ? informeDesdeController.getDisplayValueIfValid() : '';
        const h = informeHastaController ? informeHastaController.getDisplayValueIfValid() : '';
        const fechaTexto = d && h ? `Rango: ${d} - ${h}` : '';

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${titulo} - TPV</title>
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
                    <h1 style="margin:0;">${titulo}</h1>
                    <span style="font-size:14px; color:#555;">${fechaTexto}</span>
                </div>
                ${tableHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    window.visualizarInforme = async (tipo, titulo) => {
        const modal = document.getElementById('modalPreviewInforme');
        const titleEl = document.getElementById('previewInformeTitle');
        const spinner = document.getElementById('previewSpinner');
        const table = document.getElementById('previewTable');
        const empty = document.getElementById('previewEmpty');
        const thead = document.getElementById('previewThead');
        const tbody = document.getElementById('previewTbody');
        const previewExport = document.getElementById('previewExport');
        const tableWrap = modal.querySelector('.fich-card__body--table');

        titleEl.textContent = titulo;
        spinner.style.display = 'block';
        table.style.display = 'none';
        empty.style.display = 'none';
        thead.innerHTML = '';
        tbody.innerHTML = '';
        if (tableWrap) {
            tableWrap.scrollTop = 0;
            tableWrap.scrollLeft = 0;
        }

        if (previewExport) {
            previewExport.setAttribute('data-export-arg-1', tipo);
            previewExport.setAttribute('data-export-arg-2', titulo);
        }

        modal.classList.remove('hidden');

        const data = await fetchInformeJSON(tipo);
        spinner.style.display = 'none';

        if (!data || !data.rows || data.rows.length === 0) {
            const noDataMessage = await getNoDataMessage(tipo);
            empty.innerHTML = noDataMessage.replace('\n', '<br>');
            empty.style.display = 'block';
            return;
        }

        const headRow = document.createElement('tr');
        data.headers.forEach((h) => {
            const th = document.createElement('th');
            th.textContent = h;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        data.rows.forEach((r) => {
            const row = document.createElement('tr');
            r.forEach((cell) => {
                const td = document.createElement('td');
                td.textContent = cell;
                if (!isNaN(cell) && String(cell).length < 10) {
                    td.style.whiteSpace = 'nowrap';
                }
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

        table.style.display = 'table';
    };

    window.cerrarModalPreview = () => {
        document.getElementById('modalPreviewInforme').classList.add('hidden');
        closeAllExportMenus();
    };

})();
