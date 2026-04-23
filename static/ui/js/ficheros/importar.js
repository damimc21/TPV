/* ============================================================
   IMPORTAR PRODUCTOS / INVENTARIO — Lógica JS
   ============================================================ */
(function () {
    let importType = 'productos';
    let parsedRows = [];
    let parsedHeaders = [];
    let validRows = [];
    let errors = [];

    const HEADERS_PRODUCTOS = ['nombre', 'departamento', 'precio', 'activo', 'nombre_factura', 'nombre_comanda', 'color_boton', 'color_texto'];
    const HEADERS_INVENTARIO = ['nombre', 'categoria', 'unidad', 'stock_actual', 'stock_minimo', 'proveedor', 'precio_compra'];

    function getCookie(name) {
        let v = null;
        document.cookie.split(';').forEach(c => {
            const [k, val] = c.trim().split('=');
            if (k === name) v = decodeURIComponent(val);
        });
        return v;
    }

    window.setImportType = (type) => {
        importType = type;
        document.getElementById('typeProductos').classList.toggle('active', type === 'productos');
        document.getElementById('typeInventario').classList.toggle('active', type === 'inventario');
    };

    // === Drag & Drop ===
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(fileInput);
        }
    });

    window.handleFileSelect = (input) => {
        const file = input.files[0];
        if (!file) return;
        document.getElementById('fileNameBadge').textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            parseCSV(e.target.result);
            showPreview();
        };
        reader.readAsText(file, 'UTF-8');
    };

    function parseCSV(text) {
        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
            errors = ['El fichero está vacío o solo contiene cabeceras.'];
            parsedHeaders = [];
            parsedRows = [];
            return;
        }

        // Detect separator
        const sep = lines[0].includes(';') ? ';' : ',';
        parsedHeaders = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        parsedRows = [];
        errors = [];

        const expected = importType === 'productos' ? HEADERS_PRODUCTOS : HEADERS_INVENTARIO;

        // Validate headers
        const missing = expected.filter(h => h === 'nombre' && !parsedHeaders.includes(h));
        if (!parsedHeaders.includes('nombre')) {
            errors.push('Falta la columna obligatoria "nombre".');
        }

        for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
            const row = {};
            parsedHeaders.forEach((h, idx) => {
                row[h] = vals[idx] || '';
            });
            row._line = i + 1;
            row._valid = true;

            // Validations
            if (!row.nombre) {
                row._valid = false;
                row._error = 'Nombre vacío';
            }

            if (importType === 'productos') {
                if (row.precio && isNaN(parseFloat(row.precio.replace(',', '.')))) {
                    row._valid = false;
                    row._error = 'Precio inválido';
                }
            }

            parsedRows.push(row);
        }

        validRows = parsedRows.filter(r => r._valid);
    }

    function showPreview() {
        document.getElementById('stepUpload').classList.add('hidden');
        document.getElementById('stepPreview').classList.remove('hidden');

        // Stats
        const statsEl = document.getElementById('previewStats');
        statsEl.innerHTML = `
            <span class="fich-stat-pill fich-stat-pill--ok">${validRows.length} válidos</span>
            <span class="fich-stat-pill">${parsedRows.length} total</span>
            ${parsedRows.length - validRows.length > 0 ? `<span class="fich-stat-pill fich-stat-pill--err">${parsedRows.length - validRows.length} con errores</span>` : ''}
        `;

        // Headers
        const thead = document.getElementById('previewHead');
        thead.innerHTML = '<tr>' + parsedHeaders.map(h => `<th>${escHtml(h)}</th>`).join('') + '<th>Estado</th></tr>';

        // Body
        const tbody = document.getElementById('previewBody');
        tbody.innerHTML = parsedRows.slice(0, 100).map(r => {
            const cls = r._valid ? '' : 'row-err';
            const cells = parsedHeaders.map(h => `<td title="${escHtml(r[h])}">${escHtml(r[h])}</td>`).join('');
            const status = r._valid
                ? '<td style="color:#34d399;font-weight:700">✓</td>'
                : `<td style="color:#f87171;font-weight:700" title="${escHtml(r._error || '')}">${escHtml(r._error || '✗')}</td>`;
            return `<tr class="${cls}">${cells}${status}</tr>`;
        }).join('');

        if (parsedRows.length > 100) {
            tbody.innerHTML += `<tr><td colspan="${parsedHeaders.length + 1}" class="fich-empty-cell">... y ${parsedRows.length - 100} filas más</td></tr>`;
        }

        // Errors
        const errBox = document.getElementById('previewErrors');
        const errList = document.getElementById('errorList');
        const errs = parsedRows.filter(r => !r._valid);
        if (errs.length > 0 || errors.length > 0) {
            errBox.classList.remove('hidden');
            errList.innerHTML = errors.map(e => `<li>${escHtml(e)}</li>`).join('') +
                errs.slice(0, 10).map(r => `<li>Fila ${r._line}: ${escHtml(r._error || 'Error desconocido')}</li>`).join('');
        } else {
            errBox.classList.add('hidden');
        }

        document.getElementById('importCount').textContent = validRows.length;
        document.getElementById('btnConfirmImport').disabled = validRows.length === 0;
    }

    window.resetImport = () => {
        document.getElementById('stepUpload').classList.remove('hidden');
        document.getElementById('stepPreview').classList.add('hidden');
        document.getElementById('stepResult').classList.add('hidden');
        document.getElementById('csvFileInput').value = '';
        parsedRows = [];
        parsedHeaders = [];
        validRows = [];
        errors = [];
    };

    window.confirmarImportacion = async () => {
        const btn = document.getElementById('btnConfirmImport');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        const endpoint = importType === 'productos'
            ? '/api/ficheros/importar-productos/'
            : '/api/ficheros/importar-inventario/';

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ rows: validRows })
            });

            const data = await resp.json();

            document.getElementById('stepPreview').classList.add('hidden');
            document.getElementById('stepResult').classList.remove('hidden');

            if (resp.ok) {
                document.getElementById('resultSummary').innerHTML = `
                    <div class="fich-result-icon">✅</div>
                    <h3 class="fich-result-title">Importación completada</h3>
                    <p class="fich-result-detail">
                        ${data.creados || 0} creados · ${data.actualizados || 0} actualizados · ${data.errores || 0} errores
                    </p>
                `;
            } else {
                document.getElementById('resultSummary').innerHTML = `
                    <div class="fich-result-icon">❌</div>
                    <h3 class="fich-result-title">Error en la importación</h3>
                    <p class="fich-result-detail">${escHtml(data.error || 'Error desconocido')}</p>
                `;
            }
        } catch (err) {
            console.error(err);
            document.getElementById('stepPreview').classList.add('hidden');
            document.getElementById('stepResult').classList.remove('hidden');
            document.getElementById('resultSummary').innerHTML = `
                <div class="fich-result-icon">❌</div>
                <h3 class="fich-result-title">Error de conexión</h3>
                <p class="fich-result-detail">No se pudo contactar con el servidor.</p>
            `;
        }
    };

    window.descargarPlantilla = () => {
        const headers = importType === 'productos' ? HEADERS_PRODUCTOS : HEADERS_INVENTARIO;
        const bom = '\uFEFF';
        const csv = bom + headers.join(';') + '\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_${importType}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

})();
