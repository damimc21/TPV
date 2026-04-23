/*
 * Centro unico de alertas/confirmaciones de la aplicacion.
 * - Sin fallback a alert()/confirm() nativos del navegador.
 * - API comun: AppFeedback, showAlert, showConfirm, UI.alert, UI.confirm, UI.dialog.
 */
(function () {
    "use strict";

    const tr = (key, fallback) => {
        if (typeof window.t === "function") {
            return window.t(key, fallback);
        }
        if (typeof window.gettext === "function") {
            return window.gettext(fallback || key);
        }
        return fallback || key;
    };

    const IDS = {
        confirmModal: "modalConfirmarGenerico",
        confirmTitle: "confirmGenericoTitle",
        confirmMsg: "confirmGenericoMsg",
        confirmOk: "btnConfirmGenericoOk",
        confirmCancel: "btnConfirmGenericoCancel",
        alertModal: "modalAlertaGenerico",
        alertTitle: "alertGenericoTitle",
        alertMsg: "alertGenericoMsg",
        alertOk: "btnAlertGenericoOk",
        promptModal: "modalPromptGenerico",
        promptTitle: "promptGenericoTitle",
        promptMsg: "promptGenericoMsg",
        promptInput: "promptGenericoInput",
        promptOk: "btnPromptGenericoOk",
        promptCancel: "btnPromptGenericoCancel",
    };

    const DEFAULTS = {
        alertTitle: tr("common.notice", "Aviso"),
        promptTitle: tr("common.confirmation", "Confirmacion"),
        confirmTitle: tr("common.confirmation", "Confirmación"),
        okText: tr("common.accept", "Aceptar"),
        cancelText: tr("common.cancel", "Cancelar"),
    };

    let modalQueue = Promise.resolve();

    const runInQueue = (task) => {
        const run = modalQueue.then(task);
        modalQueue = run.then(() => undefined, () => undefined);
        return run;
    };

    const setMessage = (element, message, allowHtml) => {
        if (!element) return;
        if (allowHtml) {
            element.innerHTML = String(message ?? "");
            return;
        }
        element.textContent = String(message ?? "");
    };

    const setButtonVariant = (button, variant) => {
        if (!button) return;
        button.classList.remove("modal-btn-generic--primary", "modal-btn-generic--danger");
        if (variant === "danger") {
            button.classList.add("modal-btn-generic--danger");
            return;
        }
        button.classList.add("modal-btn-generic--primary");
    };

    const parseVariant = (value) => {
        const raw = String(value || "").toLowerCase();
        return raw === "danger" ? "danger" : "primary";
    };

    const openAlert = (message, opts = {}) =>
        runInQueue(
            () =>
                new Promise((resolve) => {
                    const modal = document.getElementById(IDS.alertModal);
                    const titleEl = document.getElementById(IDS.alertTitle);
                    const msgEl = document.getElementById(IDS.alertMsg);
                    const btnOk = document.getElementById(IDS.alertOk);

                    if (!modal || !msgEl || !btnOk) {
                        console.error("[AppFeedback] Modal de alerta no disponible.");
                        resolve();
                        return;
                    }

                    setMessage(titleEl, opts.title || DEFAULTS.alertTitle, false);
                    setMessage(msgEl, message, Boolean(opts.allowHtml));
                    btnOk.textContent = opts.okText || DEFAULTS.okText;
                    setButtonVariant(btnOk, parseVariant(opts.variant));

                    const close = () => {
                        modal.classList.add("hidden");
                        btnOk.removeEventListener("click", onOk);
                        modal.removeEventListener("click", onOverlay);
                        window.removeEventListener("keydown", onEsc);
                        resolve();
                    };

                    const onOk = () => close();
                    const onOverlay = (event) => {
                        if (event.target === modal) close();
                    };
                    const onEsc = (event) => {
                        if (event.key === "Escape") close();
                    };

                    btnOk.addEventListener("click", onOk);
                    modal.addEventListener("click", onOverlay);
                    window.addEventListener("keydown", onEsc);
                    modal.classList.remove("hidden");
                    btnOk.focus();
                })
        );

    const openConfirm = (message, opts = {}) =>
        runInQueue(
            () =>
                new Promise((resolve) => {
                    const modal = document.getElementById(IDS.confirmModal);
                    const titleEl = document.getElementById(IDS.confirmTitle);
                    const msgEl = document.getElementById(IDS.confirmMsg);
                    const btnOk = document.getElementById(IDS.confirmOk);
                    const btnCancel = document.getElementById(IDS.confirmCancel);

                    if (!modal || !msgEl || !btnOk || !btnCancel) {
                        console.error("[AppFeedback] Modal de confirmacion no disponible.");
                        resolve(false);
                        return;
                    }

                    setMessage(titleEl, opts.title || DEFAULTS.confirmTitle, false);
                    setMessage(msgEl, message, Boolean(opts.allowHtml));
                    btnOk.textContent = opts.okText || DEFAULTS.okText;
                    btnCancel.textContent = opts.cancelText || DEFAULTS.cancelText;
                    setButtonVariant(btnOk, parseVariant(opts.variant));

                    const close = (result) => {
                        modal.classList.add("hidden");
                        btnOk.removeEventListener("click", onOk);
                        btnCancel.removeEventListener("click", onCancel);
                        modal.removeEventListener("click", onOverlay);
                        window.removeEventListener("keydown", onKey);
                        resolve(result);
                    };

                    const onOk = () => close(true);
                    const onCancel = () => close(false);
                    const onOverlay = (event) => {
                        if (event.target === modal) close(false);
                    };
                    const onKey = (event) => {
                        if (event.key === "Escape") close(false);
                    };

                    btnOk.addEventListener("click", onOk);
                    btnCancel.addEventListener("click", onCancel);
                    modal.addEventListener("click", onOverlay);
                    window.addEventListener("keydown", onKey);
                    modal.classList.remove("hidden");
                    btnCancel.focus();
                })
        );

    const sanitizePromptValue = (rawValue, opts = {}) => {
        const options = opts || {};
        let value = String(rawValue ?? "");
        if (options.trim !== false) value = value.trim();

        if (options.digitsOnly) {
            value = value.replace(/\D+/g, "");
            if (value !== "") {
                let numeric = parseInt(value, 10);
                if (!Number.isFinite(numeric)) {
                    value = "";
                } else {
                    if (Number.isFinite(options.maxValue) && numeric > options.maxValue) {
                        numeric = options.maxValue;
                    }
                    value = String(numeric);
                }
            }
        }

        if (Number.isFinite(options.maxLength) && value.length > options.maxLength) {
            value = value.slice(0, options.maxLength);
        }

        return value;
    };

    const isPromptValueValid = (value, opts = {}) => {
        const options = opts || {};
        const v = String(value ?? "");

        if (options.required !== false && v === "") return false;
        if (v === "") return true;

        if (options.digitsOnly) {
            if (!/^\d+$/.test(v)) return false;
            const numeric = parseInt(v, 10);
            if (!Number.isFinite(numeric)) return false;
            if (Number.isFinite(options.minValue) && numeric < options.minValue) return false;
            if (Number.isFinite(options.maxValue) && numeric > options.maxValue) return false;
        }

        return true;
    };

    const openPrompt = (message, opts = {}) =>
        runInQueue(
            () =>
                new Promise((resolve) => {
                    const modal = document.getElementById(IDS.promptModal);
                    const titleEl = document.getElementById(IDS.promptTitle);
                    const msgEl = document.getElementById(IDS.promptMsg);
                    const inputEl = document.getElementById(IDS.promptInput);
                    const btnOk = document.getElementById(IDS.promptOk);
                    const btnCancel = document.getElementById(IDS.promptCancel);

                    if (!modal || !msgEl || !inputEl || !btnOk || !btnCancel) {
                        console.error("[AppFeedback] Modal de prompt no disponible.");
                        resolve(null);
                        return;
                    }

                    const options = opts || {};
                    setMessage(titleEl, options.title || DEFAULTS.promptTitle, false);
                    setMessage(msgEl, message, Boolean(options.allowHtml));
                    btnOk.textContent = options.okText || DEFAULTS.okText;
                    btnCancel.textContent = options.cancelText || DEFAULTS.cancelText;
                    setButtonVariant(btnOk, parseVariant(options.variant));

                    inputEl.type = "text";
                    inputEl.autocomplete = "off";
                    inputEl.spellcheck = false;
                    inputEl.placeholder = options.placeholder || "";
                    inputEl.inputMode = options.digitsOnly ? "numeric" : "text";
                    if (options.digitsOnly) inputEl.setAttribute("pattern", "[0-9]*");
                    else inputEl.removeAttribute("pattern");
                    if (Number.isFinite(options.maxLength)) inputEl.maxLength = options.maxLength;
                    else inputEl.removeAttribute("maxLength");

                    inputEl.value = sanitizePromptValue(options.defaultValue ?? "", options);
                    btnOk.disabled = !isPromptValueValid(inputEl.value, options);

                    const close = (result) => {
                        modal.classList.add("hidden");
                        btnOk.removeEventListener("click", onOk);
                        btnCancel.removeEventListener("click", onCancel);
                        inputEl.removeEventListener("beforeinput", onBeforeInput);
                        inputEl.removeEventListener("keydown", onInputKeyDown);
                        inputEl.removeEventListener("input", onInput);
                        modal.removeEventListener("click", onOverlay);
                        window.removeEventListener("keydown", onEsc);
                        resolve(result);
                    };

                    const normalizeAndRefresh = () => {
                        const next = sanitizePromptValue(inputEl.value, options);
                        if (next !== inputEl.value) inputEl.value = next;
                        btnOk.disabled = !isPromptValueValid(inputEl.value, options);
                    };

                    const onOk = () => {
                        if (btnOk.disabled) return;
                        close(inputEl.value);
                    };
                    const onCancel = () => close(null);
                    const onOverlay = (event) => {
                        if (event.target === modal) close(null);
                    };
                    const onEsc = (event) => {
                        if (event.key === "Escape") close(null);
                    };
                    const onBeforeInput = (event) => {
                        if (!options.digitsOnly) return;
                        if (typeof event.data === "string" && event.data && /[^0-9]/.test(event.data)) {
                            event.preventDefault();
                        }
                    };
                    const onInputKeyDown = (event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (!btnOk.disabled) close(inputEl.value);
                            return;
                        }
                        if (!options.digitsOnly) return;
                        if (event.ctrlKey || event.metaKey || event.altKey) return;
                        if (event.key.length === 1 && /[^0-9]/.test(event.key)) {
                            event.preventDefault();
                        }
                    };
                    const onInput = () => normalizeAndRefresh();

                    btnOk.addEventListener("click", onOk);
                    btnCancel.addEventListener("click", onCancel);
                    inputEl.addEventListener("beforeinput", onBeforeInput);
                    inputEl.addEventListener("keydown", onInputKeyDown);
                    inputEl.addEventListener("input", onInput);
                    modal.addEventListener("click", onOverlay);
                    window.addEventListener("keydown", onEsc);
                    modal.classList.remove("hidden");
                    inputEl.focus();
                    inputEl.select();
                })
        );

    const normalizeAlertOptions = (titleOrOpts, maybeType) => {
        if (titleOrOpts && typeof titleOrOpts === "object") {
            return {
                title: titleOrOpts.title || DEFAULTS.alertTitle,
                okText: titleOrOpts.okText || DEFAULTS.okText,
                variant: parseVariant(titleOrOpts.variant || titleOrOpts.type),
                allowHtml: Boolean(titleOrOpts.allowHtml || titleOrOpts.html),
            };
        }

        return {
            title: titleOrOpts || DEFAULTS.alertTitle,
            okText: DEFAULTS.okText,
            variant: parseVariant(maybeType),
            allowHtml: false,
        };
    };

    const normalizeConfirmOptions = (optsOrTitle, maybeType) => {
        if (optsOrTitle && typeof optsOrTitle === "object") {
            return {
                title: optsOrTitle.title || DEFAULTS.confirmTitle,
                okText: optsOrTitle.okText || optsOrTitle.confirmText || DEFAULTS.okText,
                cancelText: optsOrTitle.cancelText || DEFAULTS.cancelText,
                variant: parseVariant(
                    optsOrTitle.variant || optsOrTitle.type || (optsOrTitle.danger ? "danger" : "primary")
                ),
                allowHtml: Boolean(optsOrTitle.allowHtml || optsOrTitle.html),
            };
        }

        return {
            title: optsOrTitle || DEFAULTS.confirmTitle,
            okText: DEFAULTS.okText,
            cancelText: DEFAULTS.cancelText,
            variant: parseVariant(maybeType),
            allowHtml: false,
        };
    };

    const normalizeNotifyAlertOptions = (opts, fallbackTitle, fallbackVariant = "primary") => {
        const options = opts && typeof opts === "object" ? opts : {};
        return {
            title: options.title || fallbackTitle,
            variant: parseVariant(options.variant || options.type || fallbackVariant),
            okText: options.okText || DEFAULTS.okText,
            allowHtml: Boolean(options.allowHtml || options.html),
        };
    };

    const normalizeNotifyConfirmOptions = (opts, fallbackTitle, fallbackVariant = "primary") => {
        const options = opts && typeof opts === "object" ? opts : {};
        return {
            title: options.title || fallbackTitle,
            variant: parseVariant(options.variant || options.type || fallbackVariant),
            okText: options.okText || options.confirmText || DEFAULTS.okText,
            cancelText: options.cancelText || DEFAULTS.cancelText,
            allowHtml: Boolean(options.allowHtml || options.html),
        };
    };

    const normalizeNotifyPromptOptions = (opts, fallbackTitle) => {
        const options = opts && typeof opts === "object" ? opts : {};
        const parseBound = (value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.floor(numeric) : null;
        };
        const maxValue = parseBound(options.maxValue);
        const minValue = parseBound(options.minValue);
        const maxLength = parseBound(options.maxLength);

        return {
            title: options.title || fallbackTitle,
            variant: parseVariant(options.variant || options.type || "primary"),
            okText: options.okText || options.confirmText || DEFAULTS.okText,
            cancelText: options.cancelText || DEFAULTS.cancelText,
            allowHtml: Boolean(options.allowHtml || options.html),
            placeholder: options.placeholder || "",
            defaultValue: options.defaultValue ?? "",
            required: options.required !== false,
            trim: options.trim !== false,
            digitsOnly: Boolean(options.digitsOnly || options.numeric || options.onlyDigits),
            minValue,
            maxValue,
            maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : null,
        };
    };

    const AppFeedback = {
        alert(message, opts = {}) {
            return openAlert(message, opts);
        },
        confirm(message, opts = {}) {
            return openConfirm(message, opts);
        },
        prompt(message, opts = {}) {
            return openPrompt(message, opts);
        },
        dialog(opts = {}) {
            const options = opts || {};
            const message = options.message || "";
            if (options.showCancel) {
                return openConfirm(message, {
                    title: options.title || DEFAULTS.confirmTitle,
                    okText: options.okText || options.confirmText || DEFAULTS.okText,
                    cancelText: options.cancelText || DEFAULTS.cancelText,
                    variant: parseVariant(options.variant || options.type),
                    allowHtml: true,
                });
            }
            return openAlert(message, {
                title: options.title || DEFAULTS.alertTitle,
                okText: options.okText || options.confirmText || DEFAULTS.okText,
                variant: parseVariant(options.variant || options.type),
                allowHtml: true,
            });
        },
    };

    window.AppFeedback = AppFeedback;

    window.showAlert = function (mensaje, tituloOrOpts = DEFAULTS.alertTitle, maybeType = "primary") {
        return AppFeedback.alert(mensaje, normalizeAlertOptions(tituloOrOpts, maybeType));
    };

    window.showConfirm = function (mensaje, optsOrTitle = {}, maybeType = "primary") {
        return AppFeedback.confirm(mensaje, normalizeConfirmOptions(optsOrTitle, maybeType));
    };

    window.showPrompt = function (mensaje, defaultOrOpts = "", maybeOpts = {}) {
        let options;
        if (defaultOrOpts && typeof defaultOrOpts === "object") {
            options = { ...defaultOrOpts };
        } else {
            options = { ...(maybeOpts || {}), defaultValue: defaultOrOpts ?? "" };
        }
        return AppFeedback.prompt(
            mensaje,
            normalizeNotifyPromptOptions(options, DEFAULTS.promptTitle || DEFAULTS.confirmTitle)
        );
    };

    window.UI = window.UI || {};
    window.UI.alert = function (mensaje, tituloOrOpts = DEFAULTS.alertTitle, type = "primary") {
        if (tituloOrOpts && typeof tituloOrOpts === "object") {
            return window.showAlert(mensaje, tituloOrOpts);
        }
        return window.showAlert(mensaje, { title: tituloOrOpts, variant: type });
    };
    window.UI.confirm = function (mensaje, tituloOrOpts = DEFAULTS.confirmTitle, type = "primary") {
        if (tituloOrOpts && typeof tituloOrOpts === "object") {
            return window.showConfirm(mensaje, tituloOrOpts);
        }
        return window.showConfirm(mensaje, { title: tituloOrOpts, variant: type });
    };
    window.UI.dialog = function (opts = {}) {
        return AppFeedback.dialog(opts);
    };
    window.UI.prompt = function (mensaje, defaultOrOpts = "", maybeOpts = {}) {
        return window.showPrompt(mensaje, defaultOrOpts, maybeOpts);
    };

    // API de alto nivel para uso consistente en toda la app.
    window.Notify = window.Notify || {};
    window.Notify.info = function (mensaje, opts = {}) {
        return window.showAlert(
            mensaje,
            normalizeNotifyAlertOptions(opts, tr("common.notice", "Aviso"), "primary")
        );
    };
    window.Notify.success = function (mensaje, opts = {}) {
        return window.showAlert(
            mensaje,
            normalizeNotifyAlertOptions(opts, tr("common.success", "Correcto"), "primary")
        );
    };
    window.Notify.warning = function (mensaje, opts = {}) {
        return window.showAlert(
            mensaje,
            normalizeNotifyAlertOptions(opts, tr("common.warning", "Atención"), "primary")
        );
    };
    window.Notify.error = function (mensaje, opts = {}) {
        return window.showAlert(
            mensaje,
            normalizeNotifyAlertOptions(opts, tr("common.error", "Error"), "danger")
        );
    };
    window.Notify.confirm = function (mensaje, opts = {}) {
        return window.showConfirm(
            mensaje,
            normalizeNotifyConfirmOptions(opts, tr("common.confirmation", "Confirmación"), "primary")
        );
    };
    window.Notify.confirmDanger = function (mensaje, opts = {}) {
        return window.showConfirm(
            mensaje,
            normalizeNotifyConfirmOptions(opts, tr("common.confirmation", "Confirmación"), "danger")
        );
    };

    window.Notify.prompt = function (mensaje, defaultOrOpts = "", maybeOpts = {}) {
        let options;
        if (defaultOrOpts && typeof defaultOrOpts === "object") {
            options = { ...defaultOrOpts };
        } else {
            options = { ...(maybeOpts || {}), defaultValue: defaultOrOpts ?? "" };
        }
        return AppFeedback.prompt(
            mensaje,
            normalizeNotifyPromptOptions(options, tr("common.confirmation", "Confirmacion"))
        );
    };

    window.alert = function (mensaje) {
        return AppFeedback.alert(mensaje, { title: DEFAULTS.alertTitle });
    };

    // Evita confirm nativo del navegador. Si alguien lo usa por error, se muestra modal app y devuelve false.
    window.confirm = function (mensaje) {
        console.warn("[AppFeedback] Uso de confirm() sincrono detectado. Migrar a showConfirm/UI.confirm.");
        AppFeedback.confirm(mensaje, { title: DEFAULTS.confirmTitle });
        return false;
    };

    (function keepScrollLockedWhenModalVisible() {
        const observer = new MutationObserver(() => {
            const anyModalVisible = Boolean(
                document.querySelector(".modal:not(.hidden), .modal-overlay-generic:not(.hidden)")
            );
            document.body.style.overflow = anyModalVisible ? "hidden" : "";
        });
        observer.observe(document.body, {
            attributes: true,
            subtree: true,
            attributeFilter: ["class"],
        });
    })();
})();
