(function () {
    const gettext = typeof window !== "undefined" && typeof window.gettext === "function"
        ? window.gettext
        : (text) => text;
    const cfg = window.readJsonScript ? window.readJsonScript("tpv-sidebar-design-config", {}) : {};
    const list = document.getElementById("sidebarDesignList");
    const preview = document.getElementById("sidebarDesignPreview");
    const status = document.getElementById("sidebarDesignStatus");
    const saveBtn = document.getElementById("btnSaveSidebarDesign");
    const resetBtn = document.getElementById("btnResetSidebarDesign");
    const iconModal = document.getElementById("sidebarIconModal");
    const iconGrid = document.getElementById("sidebarIconGrid");
    const iconSearch = document.getElementById("sidebarIconSearch");
    const iconClose = document.getElementById("sidebarIconClose");
    const iconTitle = document.getElementById("sidebarIconTitle");

    const ICON_BASE = cfg.iconsBaseUrl || "/static/ui/img/iconos/";
    const DEFAULT_BUTTONS = [
        { id: "btnCobrar", label: "Total", short: "Total", icon: "hand-coins", span: 2, bg: "#0f3f2f", color: "#4ade80", border: "#238a55" },
        { id: "btnComprobante", label: "Comprobante", short: "Comp.", icon: "receipt-text", span: 2, bg: "#0d2a44", color: "#ffffff", border: "#265f95" },
        { id: "btnReimprimir", label: "Reimpr.", short: "Reimp.", icon: "printer", span: 1, bg: "#1b2d30", color: "#ffffff", border: "#3b4a50" },
        { id: "btnFactura", label: "Factura", short: "Fact.", icon: "notepad-text", span: 1, bg: "#1b2d30", color: "#ffffff", border: "#3b4a50" },
        { id: "btnDescuento", label: "Dto.", short: "Dto.", icon: "tag", span: 1, bg: "#1b2d30", color: "#ffffff", border: "#3b4a50" },
        { id: "btnInvita", label: "Invitar", short: "Inv.", icon: "gift", span: 1, bg: "#232817", color: "#ffca28", border: "#665c12" },
        { id: "btnAnularLinea", label: "Anular", short: "Anul.", icon: "scissors", span: 2, bg: "#1b2d30", color: "#ffffff", border: "#7b342d" },
        { id: "btnBorrarComanda", label: "Borrar comanda", short: "Borrar", icon: "trash-2", span: 2, bg: "#1a1f2a", color: "#ffffff", border: "#7b342d" },
        { id: "btnSepararProductos", label: "Separar", short: "Sep.", icon: "split", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnJuntarProductos", label: "Juntar", short: "Junt.", icon: "merge", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnSideComentario", label: "Comentario", short: "Coment.", icon: "message-circle-more", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnSideSuplemento", label: "Suplemento", short: "Supl.", icon: "circle-plus", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnCliente", label: "Cliente", short: "Cliente", icon: "user-round", span: 2, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnDividirCuenta", label: "Dividir cuenta", short: "Dividir", icon: "chart-pie", span: 2, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnCajon", label: "Caj\u00f3n", short: "Caj\u00f3n", icon: "drawer", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnOpciones", label: "Opciones", short: "Opc.", icon: "cog", span: 1, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
        { id: "btnSalir", label: "Salir", short: "Salir", icon: "log-out", span: 2, bg: "#1a1f2a", color: "#ffffff", border: "#3b4a50" },
    ];
    const DEFAULT_ITEMS = [
        { type: "button", id: "btnCobrar" },
        { type: "button", id: "btnComprobante" },
        { type: "button", id: "btnReimprimir" },
        { type: "button", id: "btnFactura" },
        { type: "button", id: "btnDescuento" },
        { type: "button", id: "btnInvita" },
        { type: "button", id: "btnAnularLinea" },
        { type: "sep", id: "sepLinea" },
        { type: "button", id: "btnBorrarComanda" },
        { type: "button", id: "btnSepararProductos" },
        { type: "button", id: "btnJuntarProductos" },
        { type: "button", id: "btnSideComentario" },
        { type: "button", id: "btnSideSuplemento" },
        { type: "button", id: "btnCliente" },
        { type: "sep", id: "sepCliente" },
        { type: "button", id: "btnDividirCuenta" },
        { type: "button", id: "btnCajon" },
        { type: "button", id: "btnOpciones" },
        { type: "sep", id: "sepOpciones" },
        { type: "button", id: "btnSalir" },
    ];
    const LOCALIZED_DEFAULT_LABELS = {
        btnCobrar: { label: gettext("Total"), short: gettext("Total"), known: ["Total"] },
        btnComprobante: { label: gettext("Comprobante"), short: gettext("Comp."), known: ["Comprobante", "Comp."] },
        btnReimprimir: { label: gettext("Reimprimir"), short: gettext("Reimp."), known: ["Reimpr.", "Reimprimir", "Reimp."] },
        btnFactura: { label: gettext("Factura"), short: gettext("Fact."), known: ["Factura", "Fact."] },
        btnDescuento: { label: gettext("Descuento"), short: gettext("Dto."), known: ["Dto.", "Descuento"] },
        btnInvita: { label: gettext("Invitar"), short: gettext("Inv."), known: ["Invitar", "Inv."] },
        btnAnularLinea: { label: gettext("Anular"), short: gettext("Anul."), known: ["Anular", "Anul."] },
        btnBorrarComanda: { label: gettext("Borrar comanda"), short: gettext("Borrar"), known: ["Borrar comanda", "Borrar"] },
        btnSepararProductos: { label: gettext("Separar"), short: gettext("Sep."), known: ["Separar", "Sep."] },
        btnJuntarProductos: { label: gettext("Juntar"), short: gettext("Junt."), known: ["Juntar", "Junt."] },
        btnSideComentario: { label: gettext("Comentario"), short: gettext("Coment."), known: ["Comentario", "Coment."] },
        btnSideSuplemento: { label: gettext("Suplemento"), short: gettext("Supl."), known: ["Suplemento", "Supl."] },
        btnCliente: { label: gettext("Cliente"), short: gettext("Cliente"), known: ["Cliente"] },
        btnDividirCuenta: { label: gettext("Dividir cuenta"), short: gettext("Dividir"), known: ["Dividir cuenta", "Dividir"] },
        btnCajon: { label: gettext("Cajón"), short: gettext("Cajón"), known: ["Cajón", "Caj\u00f3n"] },
        btnOpciones: { label: gettext("Opciones"), short: gettext("Opc."), known: ["Opciones", "Opc."] },
        btnSalir: { label: gettext("Salir"), short: gettext("Salir"), known: ["Salir"] },
    };
    const PRODUCT_COLORS = [
        "#ffffff", "#dfe4ea", "#747d8c", "#000000",
        "#b9f6ca", "#2ecc71", "#27ae60", "#1b5e20",
        "#d1eaff", "#3498db", "#2980b9", "#191970",
        "#fff9c4", "#f1c40f", "#f39c12", "#f57f17",
        "#ffcdd2", "#e74c3c", "#c0392b", "#b71c1c",
        "#fce4ec", "#f06292", "#e91e63", "#ad1457",
        "#ffe0b2", "#e67e22", "#d35400", "#e65100",
        "#d7ccc8", "#a1887f", "#795548", "#3e2723",
    ];
    const TPV_COLORS = [
        "#0f3f2f", "#4ade80", "#238a55", "#0d2a44",
        "#265f95", "#1b2d30", "#3b4a50", "#232817",
        "#ffca28", "#665c12", "#1a1f2a", "#7b342d",
    ];
    const COLOR_PRESETS = Array.from(new Set([...PRODUCT_COLORS, ...TPV_COLORS]));
    const buttonDefaults = new Map(DEFAULT_BUTTONS.map(item => [item.id, item]));
    const itemDefaults = new Map(DEFAULT_ITEMS.map(item => [item.id, item]));

    let state = normalizeConfig(cfg.current || {});
    let savedSnapshot = snapshotState();
    let iconOptions = null;
    let activeIconButton = null;
    let movingHighlightTimer = null;
    let isSaving = false;
    let skipUnsavedNavigationGuard = false;

    function normalizeConfig(raw) {
        const normalized = { items: normalizeItems(raw.items), buttons: {} };
        DEFAULT_BUTTONS.forEach(item => {
            const saved = raw.buttons?.[item.id] || {};
            const label = normalizeLabel(saved.label, item.label);
            normalized.buttons[item.id] = {
                label,
                short: normalizeLabel(saved.short, abbreviate(label, item.short)),
                icon: normalizeIcon(saved.icon, item.icon),
                span: Number(saved.span) === 1 ? 1 : item.span,
                bg: normalizeColor(saved.bg, item.bg),
                color: normalizeColor(saved.color, item.color),
                border: normalizeColor(saved.border, item.border),
            };
        });
        return normalized;
    }

    function normalizeItems(rawItems) {
        const source = Array.isArray(rawItems) ? rawItems : DEFAULT_ITEMS;
        const items = [];
        const seen = new Set();

        source.forEach(rawItem => {
            const id = typeof rawItem === "string" ? rawItem : rawItem?.id;
            const defaultItem = itemDefaults.get(id);
            if (!defaultItem || seen.has(id)) return;
            seen.add(id);
            items.push({ ...defaultItem });
        });

        DEFAULT_ITEMS.forEach(item => {
            if (!seen.has(item.id)) items.push({ ...item });
        });

        return items;
    }

    function normalizeLabel(value, fallback) {
        const text = typeof value === "string" ? value.trim() : "";
        return text || fallback;
    }

    function normalizeIcon(value, fallback) {
        const text = typeof value === "string" ? value.trim() : "";
        return /^[a-z0-9-]+$/i.test(text) ? text : fallback;
    }

    function normalizeColor(value, fallback) {
        const text = typeof value === "string" ? value.trim().toLowerCase() : "";
        return /^#[0-9a-f]{6}$/.test(text) ? text : fallback;
    }

    function abbreviate(label, fallback) {
        const text = normalizeLabel(label, fallback);
        if (text.length <= 8) return text;
        const first = text.split(/\s+/)[0];
        return first.length <= 8 ? first : `${first.slice(0, 7)}.`;
    }

    function getDisplayText(id, field) {
        const value = state.buttons[id]?.[field] || "";
        const localized = LOCALIZED_DEFAULT_LABELS[id];
        if (!localized) return value;
        const defaultValue = buttonDefaults.get(id)?.[field];
        const knownValues = new Set([defaultValue, ...(localized.known || [])].filter(Boolean));
        return knownValues.has(value) ? localized[field] : value;
    }

    function iconUrl(icon) {
        return `${ICON_BASE}${encodeURIComponent(normalizeIcon(icon, "circle-alert"))}.svg`;
    }

    function iconMask(icon, className) {
        return `<span class="${className}" style="--icon-url: url('${iconUrl(icon)}');"></span>`;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        }[char]));
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function getCSRFToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    function snapshotState() {
        return JSON.stringify(state);
    }

    function hasUnsavedChanges() {
        return snapshotState() !== savedSnapshot;
    }

    function updateDirtyUI() {
        const dirty = hasUnsavedChanges();
        if (saveBtn) {
            saveBtn.disabled = isSaving;
            saveBtn.classList.toggle("is-dirty", dirty);
        }
        if (status && dirty && !status.textContent) {
            status.textContent = gettext("Sin guardar");
        }
        if (status && !dirty && status.textContent === gettext("Sin guardar")) {
            status.textContent = "";
        }
    }

    async function confirmLeave() {
        if (!hasUnsavedChanges()) return true;
        if (window.Notify && typeof window.Notify.confirmDanger === "function") {
            return await window.Notify.confirmDanger(
                gettext("Tienes cambios sin guardar. ¿Quieres salir sin guardar?"),
                { title: gettext("Cambios sin guardar") }
            );
        }
        return window.confirm(gettext("Tienes cambios sin guardar. ¿Quieres salir sin guardar?"));
    }

    function orderedButtonIds() {
        return state.items.filter(item => item.type === "button" && buttonDefaults.has(item.id)).map(item => item.id);
    }

    function render() {
        renderList();
        renderPreview();
        updateDirtyUI();
    }

    function renderList() {
        const rows = orderedButtonIds().map(id => {
            const saved = state.buttons[id];
            const displayLabel = getDisplayText(id, "label");
            return `
                <div class="tpv-design-row" data-button-id="${id}">
                    <div class="tpv-design-row__name">
                        <button class="tpv-icon-trigger" type="button" data-icon-picker="${id}" title="${gettext("Cambiar icono")}">
                            ${iconMask(saved.icon, "tpv-icon-mask tpv-icon-mask--row")}
                        </button>
                        <input class="tpv-design-row__input" data-field="label" type="text" value="${escapeAttr(displayLabel)}" autocomplete="off">
                    </div>
                    <div class="tpv-design-row__field">
                        <label>${gettext("Ancho")}</label>
                        ${renderWidthSelect(saved.span)}
                    </div>
                    ${renderColorField(gettext("Fondo"), "bg", saved.bg)}
                    ${renderColorField(gettext("Texto"), "color", saved.color)}
                    ${renderColorField(gettext("Borde"), "border", saved.border)}
                    <div class="tpv-design-row__move" aria-label="${gettext("Mover botón")}">
                        <button type="button" data-move="${id}" data-direction="-1" title="${gettext("Subir")}">
                            <img src="/static/ui/img/iconos/move-up.svg" alt="">
                        </button>
                        <button type="button" data-move="${id}" data-direction="1" title="${gettext("Bajar")}">
                            <img src="/static/ui/img/iconos/move-down.svg" alt="">
                        </button>
                    </div>
                    <button class="tpv-design-row__reset" type="button" data-reset="${id}" title="${gettext("Restablecer")}">
                        <img src="/static/ui/img/iconos/refresh-ccw.svg" alt="">
                    </button>
                </div>
            `;
        }).join("");
        list.innerHTML = rows;
        window.TPVSelect?.refresh(list);
    }

    function renderWidthSelect(span) {
        return `
            <select class="tpv-design-width-select" data-ui-select data-ui-select-size="compact" data-field="span">
                <option value="2"${span === 2 ? " selected" : ""}>${gettext("Entero")}</option>
                <option value="1"${span === 1 ? " selected" : ""}>${gettext("Mitad")}</option>
            </select>
        `;
    }

    function renderColorField(label, field, value) {
        return `
            <div class="tpv-design-row__field tpv-design-row__field--color">
                <label>${label}</label>
                <div class="color-picker-component tpv-color-picker" data-field="${field}">
                    <button type="button" class="color-swatch-btn" data-color-trigger title="${label}">
                        <span class="color-dot" style="background-color:${value};"></span>
                    </button>
                    <div class="color-picker-popover hidden">
                        <div class="popover-header">
                            <span>${label}</span>
                            <button type="button" class="popover-close-btn" data-close-popover>&times;</button>
                        </div>
                        <div class="color-palette">
                            ${COLOR_PRESETS.map(color => `
                                <button type="button" class="swatch${color === value ? " is-active" : ""}" style="background-color:${color};" data-color="${color}" title="${color}"></button>
                            `).join("")}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPreview() {
        const rows = [];
        const items = state.items;

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item.type === "sep") {
                rows.push(`<div class="tpv-preview-sep"></div>`);
                continue;
            }

            const saved = state.buttons[item.id];
            if (!saved) continue;

            if (saved.span === 2) {
                rows.push(`<div class="tpv-preview-row tpv-preview-row--full">${renderPreviewButton(item.id, saved)}</div>`);
                continue;
            }

            const next = items[i + 1];
            const nextSaved = next?.type === "button" ? state.buttons[next.id] : null;
            if (nextSaved && nextSaved.span === 1) {
                rows.push(`<div class="tpv-preview-row">${renderPreviewButton(item.id, saved)}${renderPreviewButton(next.id, nextSaved)}</div>`);
                i += 1;
            } else {
                rows.push(`<div class="tpv-preview-row">${renderPreviewButton(item.id, saved)}</div>`);
            }
        }

        preview.innerHTML = rows.join("");
    }

    function renderPreviewButton(id, saved) {
        const label = saved.span === 1 ? getDisplayText(id, "short") : getDisplayText(id, "label");
        return `
            <button class="tpv-preview-btn" type="button" style="background:${saved.bg}; color:${saved.color}; border-color:${saved.border};">
                ${iconMask(saved.icon, "tpv-icon-mask tpv-icon-mask--preview")}
                <span>${escapeHtml(label)}</span>
            </button>
        `;
    }

    function setStatus(text) {
        if (!status) return;
        status.textContent = text;
        if (text) {
            window.setTimeout(() => {
                status.textContent = "";
                updateDirtyUI();
            }, 1800);
        }
    }

    function closeSelects() {
        window.TPVSelect?.closeAll();
    }

    function closeColorPopovers(except = null) {
        list.querySelectorAll(".tpv-color-picker").forEach(picker => {
            if (picker === except) return;
            picker.querySelector(".color-picker-popover")?.classList.add("hidden");
        });
    }

    function moveButton(id, direction) {
        const buttonIndices = state.items
            .map((item, index) => item.type === "button" ? index : null)
            .filter(index => index !== null);
        const currentIndex = state.items.findIndex(item => item.id === id);
        const buttonPosition = buttonIndices.indexOf(currentIndex);
        const targetIndex = buttonIndices[buttonPosition + direction];
        if (targetIndex === undefined) return;
        [state.items[currentIndex], state.items[targetIndex]] = [state.items[targetIndex], state.items[currentIndex]];
        render();
        spotlightMovedButton(id);
    }

    function spotlightMovedButton(id) {
        window.clearTimeout(movingHighlightTimer);
        window.requestAnimationFrame(() => {
            const row = Array.from(list.querySelectorAll(".tpv-design-row")).find(item => item.dataset.buttonId === id);
            if (!row) return;
            row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            row.classList.add("is-moving");
            movingHighlightTimer = window.setTimeout(() => {
                row.classList.remove("is-moving");
            }, 1600);
        });
    }

    function resetButton(id) {
        const item = buttonDefaults.get(id);
        if (!item) return;
        state.buttons[id] = {
            label: item.label,
            short: item.short,
            icon: item.icon,
            span: item.span,
            bg: item.bg,
            color: item.color,
            border: item.border,
        };
        render();
    }

    async function loadIcons() {
        if (iconOptions) return iconOptions;
        iconOptions = DEFAULT_BUTTONS.map(item => ({ name: item.icon, url: iconUrl(item.icon) }));
        if (!cfg.iconsUrl) return iconOptions;

        try {
            const response = await fetch(cfg.iconsUrl, { headers: { "Accept": "application/json" } });
            const payload = await response.json();
            if (response.ok && Array.isArray(payload.iconos)) {
                iconOptions = payload.iconos
                    .filter(item => item?.name && item?.url)
                    .map(item => ({ name: item.name, url: item.url }));
            }
        } catch (error) {
            console.warn(gettext("No se pudieron cargar los iconos TPV"), error);
        }
        return iconOptions;
    }

    async function openIconModal(id) {
        if (!iconModal) return;
        activeIconButton = id;
        const settings = state.buttons[id];
        iconTitle.textContent = `${gettext("Icono")}: ${getDisplayText(id, "label")}`;
        iconModal.classList.remove("hidden");
        iconModal.setAttribute("aria-hidden", "false");
        if (iconSearch) iconSearch.value = "";
        await loadIcons();
        renderIconGrid();
        window.setTimeout(() => iconSearch?.focus(), 0);
    }

    function closeIconModal() {
        if (!iconModal) return;
        iconModal.classList.add("hidden");
        iconModal.setAttribute("aria-hidden", "true");
        activeIconButton = null;
    }

    function renderIconGrid() {
        if (!iconGrid) return;
        const query = (iconSearch?.value || "").trim().toLowerCase();
        const current = activeIconButton ? state.buttons[activeIconButton]?.icon : "";
        const filtered = (iconOptions || []).filter(item => item.name.toLowerCase().includes(query));
        if (filtered.length === 0) {
            iconGrid.innerHTML = `<div class="tpv-icon-empty">${gettext("No se encontraron iconos.")}</div>`;
            return;
        }
        iconGrid.innerHTML = filtered.map(item => `
            <button class="tpv-icon-option${item.name === current ? " is-active" : ""}" type="button" data-icon-name="${escapeAttr(item.name)}">
                <img src="${escapeAttr(item.url)}" alt="">
                <span>${escapeHtml(item.name)}</span>
            </button>
        `).join("");
    }

    list.addEventListener("input", (event) => {
        const field = event.target.dataset.field;
        if (field !== "label") return;
        const row = event.target.closest(".tpv-design-row");
        if (!row) return;
        const id = row.dataset.buttonId;
        const label = normalizeLabel(event.target.value, buttonDefaults.get(id).label);
        state.buttons[id].label = label;
        state.buttons[id].short = abbreviate(label, buttonDefaults.get(id).short);
        renderPreview();
        updateDirtyUI();
    });

    list.addEventListener("change", (event) => {
        const field = event.target.dataset.field;
        if (field !== "span") return;
        const row = event.target.closest(".tpv-design-row");
        if (!row) return;
        const id = row.dataset.buttonId;
        state.buttons[id].span = Number(event.target.value) === 1 ? 1 : 2;
        renderPreview();
        updateDirtyUI();
    });

    list.addEventListener("click", (event) => {
        const colorTrigger = event.target.closest("[data-color-trigger]");
        if (colorTrigger) {
            event.stopPropagation();
            const picker = colorTrigger.closest(".tpv-color-picker");
            const popover = picker.querySelector(".color-picker-popover");
            const willOpen = popover.classList.contains("hidden");
            closeSelects();
            closeColorPopovers(picker);
            popover.classList.toggle("hidden", !willOpen);
            return;
        }

        if (event.target.closest("[data-close-popover]")) {
            event.stopPropagation();
            closeColorPopovers();
            return;
        }

        const swatch = event.target.closest("[data-color]");
        if (swatch) {
            event.stopPropagation();
            const row = swatch.closest(".tpv-design-row");
            const picker = swatch.closest(".tpv-color-picker");
            const id = row.dataset.buttonId;
            const field = picker.dataset.field;
            const color = normalizeColor(swatch.dataset.color, state.buttons[id][field]);
            state.buttons[id][field] = color;
            picker.querySelector(".color-dot").style.backgroundColor = color;
            picker.querySelectorAll(".swatch").forEach(item => item.classList.toggle("is-active", item === swatch));
            closeColorPopovers();
            renderPreview();
            updateDirtyUI();
            return;
        }

        const moveBtn = event.target.closest("[data-move]");
        if (moveBtn) {
            moveButton(moveBtn.dataset.move, Number(moveBtn.dataset.direction));
            return;
        }

        const resetControl = event.target.closest("[data-reset]");
        if (resetControl) {
            resetButton(resetControl.dataset.reset);
            return;
        }

        const iconControl = event.target.closest("[data-icon-picker]");
        if (iconControl) {
            openIconModal(iconControl.dataset.iconPicker);
        }
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".tpv-color-picker")) closeColorPopovers();
    });

    list.addEventListener("scroll", closeSelects);

    document.addEventListener("click", async (event) => {
        if (skipUnsavedNavigationGuard || !hasUnsavedChanges()) return;
        const link = event.target.closest("a[href]");
        if (!link) return;

        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (link.target && link.target.toLowerCase() !== "_self") return;
        if (link.hasAttribute("data-skip-unsaved-check")) return;

        const hrefRaw = link.getAttribute("href") || "";
        if (!hrefRaw || hrefRaw.startsWith("#") || hrefRaw.startsWith("javascript:")) return;

        event.preventDefault();
        const ok = await confirmLeave();
        if (!ok) return;

        skipUnsavedNavigationGuard = true;
        window.location.href = link.href;
    });

    window.addEventListener("beforeunload", (event) => {
        if (skipUnsavedNavigationGuard || !hasUnsavedChanges()) return;
        event.preventDefault();
        event.returnValue = "";
    });

    resetBtn.addEventListener("click", () => {
        state = normalizeConfig({});
        render();
        setStatus(gettext("Restablecido"));
    });

    saveBtn.addEventListener("click", async () => {
        isSaving = true;
        updateDirtyUI();
        try {
            const response = await fetch(cfg.saveUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCSRFToken(),
                },
                body: JSON.stringify({
                    clave: "tpv_sidebar_layout",
                    valor: JSON.stringify(state),
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) throw new Error(payload.error || gettext("No se pudo guardar."));
            savedSnapshot = snapshotState();
            setStatus(gettext("Guardado"));
        } catch (error) {
            setStatus(error.message || gettext("Error"));
        } finally {
            isSaving = false;
            updateDirtyUI();
        }
    });

    if (iconClose) iconClose.addEventListener("click", closeIconModal);
    if (iconModal) {
        iconModal.addEventListener("click", event => {
            if (event.target === iconModal) closeIconModal();
        });
    }
    if (iconSearch) iconSearch.addEventListener("input", renderIconGrid);
    if (iconGrid) {
        iconGrid.addEventListener("click", event => {
            const option = event.target.closest("[data-icon-name]");
            if (!option || !activeIconButton) return;
            state.buttons[activeIconButton].icon = normalizeIcon(option.dataset.iconName, state.buttons[activeIconButton].icon);
            render();
            closeIconModal();
        });
    }
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeIconModal();
    });

    render();
})();
