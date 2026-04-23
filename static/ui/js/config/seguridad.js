(function () {
    "use strict";

    const form = document.getElementById("authSecurityForm");
    if (!form) return;

    const t = (text) => (typeof gettext === "function" ? gettext(text) : text);
    const askConfirm = async (message) => {
        return Boolean(await Notify.confirm(message, { title: t("Confirmar") }));
    };
    const showInfo = async (message, title = t("Aviso")) => {
        await Notify.info(message, { title });
    };

    const throttleRulesInput = document.getElementById("throttleRulesJson");
    const throttleRulesContainer = document.getElementById("throttleRules");
    const throttleRuleTemplate = document.getElementById("throttleRuleTemplate");
    const addThrottleRuleBtn = document.getElementById("addThrottleRule");
    const enabledSwitch = document.getElementById("enabledSwitch");
    const throttleBlock = document.getElementById("throttleBlock");
    const throttleFieldset = document.getElementById("throttleFieldset");

    const userLockBlock = document.getElementById("userLockBlock");
    const userLockFieldset = document.getElementById("userLockFieldset");
    const userLockEnabled = document.getElementById("userLockEnabled");
    const userLockEnableWrap = document.getElementById("userLockEnableWrap");
    const userLockPermanent = document.getElementById("userLockPermanent");
    const userLockModeInput = document.getElementById("userLockModeInput");
    const userLockDurationWrap = document.getElementById("userLockDurationWrap");
    const userLockPermanentHint = document.getElementById("userLockPermanentHint");
    const userLockMinHint = document.getElementById("userLockMinHint");
    const userLockAttemptsInput = form.querySelector("input[name='user_lock_attempts']");
    const userLockSecondsInput = form.querySelector("input[name='user_lock_seconds']");
    const secondaryActionBtn = document.getElementById("secSecondaryAction");
    const saveBtn = document.getElementById("secSaveBtn");

    const USER_LOCK_ATTEMPTS_MAX = 9999;
    const DEFAULT_PROFILE = {
        enabled: true,
        rules: [
            { attempts: 5, seconds: 60 },
            { attempts: 5, seconds: 300 },
        ],
        userLockEnabled: false,
        userLockPermanent: false,
        userLockAttempts: "20",
        userLockSeconds: "1800",
    };

    let initialSnapshot = "";
    let allowSubmit = false;
    let skipUnsavedNavigationGuard = false;
    let isApplyingState = false;

    const clampInt = (value, min, max, fallback) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    };

    const clampInputToMax = (input) => {
        if (!input || input.value === "") return;
        const max = Number.parseInt(input.max, 10);
        const parsed = Number.parseInt(input.value, 10);
        if (!Number.isFinite(max) || !Number.isFinite(parsed)) return;
        if (parsed > max) {
            input.value = String(max);
        }
    };

    const getRuleRows = () => Array.from(throttleRulesContainer.querySelectorAll("[data-rule-row]"));

    const getMinUserLockAttempts = () =>
        Math.max(
            1,
            getRuleRows().reduce((total, row) => {
                const attemptsInput = row.querySelector("[data-rule-attempts]");
                if (!attemptsInput) return total;
                return total + clampInt(attemptsInput.value, 1, 50, 5);
            }, 0)
        );

    const getUserLockAttemptsBounds = () => {
        const min = getMinUserLockAttempts();
        return {
            min,
            max: Math.max(USER_LOCK_ATTEMPTS_MAX, min),
        };
    };

    const refreshUserLockAttemptsLimit = () => {
        if (!userLockAttemptsInput) return;
        const { min, max } = getUserLockAttemptsBounds();
        userLockAttemptsInput.min = String(min);
        userLockAttemptsInput.max = String(max);
        userLockAttemptsInput.value = String(
            clampInt(userLockAttemptsInput.value, min, max, Math.max(min, 20))
        );
        if (userLockMinHint) {
            userLockMinHint.textContent = `${t("Mínimo automático por bloqueos soft")}: ${min} ${t("fallo(s)")}.`;
        }
    };

    const setBlockEnabled = (block, fieldset, enabled) => {
        if (!block || !fieldset) return;
        block.classList.toggle("is-disabled", !enabled);
        fieldset.disabled = !enabled;
    };

    const getRuleTitle = (index) => {
        if (index === 0) return t("Bloqueo inicial");
        if (index === 1) return t("Segundo bloqueo");
        return `${t("Bloqueo")} ${index + 1}`;
    };

    const updateRuleTitles = () => {
        getRuleRows().forEach((row, index) => {
            const title = row.querySelector("[data-rule-title]");
            if (title) title.textContent = getRuleTitle(index);
        });
    };

    const updateRemoveButtons = () => {
        const rows = getRuleRows();
        const onlyOne = rows.length <= 1;
        rows.forEach((row) => {
            const removeBtn = row.querySelector("[data-rule-remove]");
            if (!removeBtn) return;
            removeBtn.disabled = onlyOne;
        });
    };

    const normalizeRuleInputs = () => {
        getRuleRows().forEach((row) => {
            const attemptsInput = row.querySelector("[data-rule-attempts]");
            const secondsInput = row.querySelector("[data-rule-seconds]");
            if (!attemptsInput || !secondsInput) return;
            attemptsInput.value = String(clampInt(attemptsInput.value, 1, 50, 1));
            secondsInput.value = String(clampInt(secondsInput.value, 10, 7200, 60));
        });
    };

    const serializeRules = (normalize = false) => {
        if (normalize) {
            normalizeRuleInputs();
        }
        const rules = getRuleRows()
            .map((row) => {
                const attemptsInput = row.querySelector("[data-rule-attempts]");
                const secondsInput = row.querySelector("[data-rule-seconds]");
                if (!attemptsInput || !secondsInput) return null;
                return {
                    attempts: clampInt(attemptsInput.value, 1, 50, 1),
                    seconds: clampInt(secondsInput.value, 10, 7200, 60),
                };
            })
            .filter(Boolean);

        if (!rules.length) {
            rules.push({ attempts: 5, seconds: 60 });
        }

        throttleRulesInput.value = JSON.stringify(rules);
        refreshUserLockAttemptsLimit();
    };

    const addRule = (defaults = { attempts: 5, seconds: 300 }, silent = false) => {
        if (!throttleRuleTemplate || !throttleRulesContainer) return;
        const node = throttleRuleTemplate.content.firstElementChild.cloneNode(true);
        const attemptsInput = node.querySelector("[data-rule-attempts]");
        const secondsInput = node.querySelector("[data-rule-seconds]");
        if (attemptsInput) attemptsInput.value = String(clampInt(defaults.attempts, 1, 50, 5));
        if (secondsInput) secondsInput.value = String(clampInt(defaults.seconds, 10, 7200, 60));
        throttleRulesContainer.appendChild(node);
        if (silent) return;
        updateRuleTitles();
        updateRemoveButtons();
        serializeRules(false);
        updateDirtyState();
    };

    const replaceRules = (rules) => {
        if (!throttleRulesContainer) return;
        throttleRulesContainer.innerHTML = "";
        const safeRules = Array.isArray(rules) && rules.length ? rules : [{ attempts: 5, seconds: 60 }];
        safeRules.forEach((rule) => addRule(rule, true));
        updateRuleTitles();
        updateRemoveButtons();
        serializeRules(false);
    };

    const syncUserLockMode = () => {
        const userLockGroupEnabled = Boolean(userLockEnabled && userLockEnabled.checked);
        const permanentEnabled = Boolean(userLockPermanent && userLockPermanent.checked);

        let mode = "none";
        if (userLockGroupEnabled) {
            mode = permanentEnabled ? "permanent" : "temporary";
        }
        if (userLockModeInput) {
            userLockModeInput.value = mode;
        }

        if (userLockDurationWrap) {
            userLockDurationWrap.classList.toggle("is-hidden", mode !== "temporary");
        }
        if (userLockSecondsInput) {
            userLockSecondsInput.readOnly = mode !== "temporary";
            userLockSecondsInput.classList.toggle("is-readonly", mode !== "temporary");
        }
        if (userLockPermanentHint) {
            userLockPermanentHint.hidden = mode !== "permanent";
        }
    };

    const refreshAvailability = () => {
        const globalEnabled = Boolean(enabledSwitch && enabledSwitch.checked);
        setBlockEnabled(throttleBlock, throttleFieldset, globalEnabled);

        if (userLockEnabled) {
            userLockEnabled.disabled = !globalEnabled;
        }
        if (userLockEnableWrap) {
            userLockEnableWrap.classList.toggle("is-disabled", !globalEnabled);
        }

        const userLockGroupEnabled = globalEnabled && Boolean(userLockEnabled && userLockEnabled.checked);
        setBlockEnabled(userLockBlock, userLockFieldset, userLockGroupEnabled);

        if (userLockPermanent) {
            userLockPermanent.disabled = !userLockGroupEnabled;
        }

        syncUserLockMode();
    };

    const getFormState = () => ({
        enabled: Boolean(enabledSwitch && enabledSwitch.checked),
        rules: getRuleRows().map((row) => {
            const attemptsInput = row.querySelector("[data-rule-attempts]");
            const secondsInput = row.querySelector("[data-rule-seconds]");
            return {
                attempts: attemptsInput ? attemptsInput.value : "",
                seconds: secondsInput ? secondsInput.value : "",
            };
        }),
        userLockEnabled: Boolean(userLockEnabled && userLockEnabled.checked),
        userLockPermanent: Boolean(userLockPermanent && userLockPermanent.checked),
        userLockAttempts: userLockAttemptsInput ? userLockAttemptsInput.value : "",
        userLockSeconds: userLockSecondsInput ? userLockSecondsInput.value : "",
    });

    const getSnapshot = () => JSON.stringify(getFormState());
    const hasUnsavedChanges = () => getSnapshot() !== initialSnapshot;

    const updateSecondaryActionButton = () => {
        if (!secondaryActionBtn) return;
        const resetLabel = secondaryActionBtn.dataset.labelReset || t("Restablecer");
        const cancelLabel = secondaryActionBtn.dataset.labelCancel || t("Cancelar cambios");
        const dirty = hasUnsavedChanges();
        secondaryActionBtn.textContent = dirty ? cancelLabel : resetLabel;
        secondaryActionBtn.classList.toggle("is-dirty", dirty);
    };

    const updateDirtyState = () => {
        if (isApplyingState) return;
        updateSecondaryActionButton();
    };

    const applyState = (state) => {
        isApplyingState = true;
        if (enabledSwitch) enabledSwitch.checked = Boolean(state.enabled);
        replaceRules(state.rules);
        if (userLockEnabled) userLockEnabled.checked = Boolean(state.userLockEnabled);
        if (userLockPermanent) userLockPermanent.checked = Boolean(state.userLockPermanent);
        if (userLockAttemptsInput) userLockAttemptsInput.value = String(state.userLockAttempts ?? "20");
        if (userLockSecondsInput) userLockSecondsInput.value = String(state.userLockSeconds ?? "1800");
        refreshUserLockAttemptsLimit();
        refreshAvailability();
        serializeRules(true);
        isApplyingState = false;
        updateSecondaryActionButton();
    };

    const restoreInitialState = () => {
        if (!initialSnapshot) return;
        try {
            applyState(JSON.parse(initialSnapshot));
        } catch {
            applyState(DEFAULT_PROFILE);
        }
    };

    const resetToDefaults = () => applyState(DEFAULT_PROFILE);

    if (addThrottleRuleBtn) {
        addThrottleRuleBtn.addEventListener("click", () => addRule());
    }

    if (throttleRulesContainer) {
        throttleRulesContainer.addEventListener("click", (event) => {
            const removeBtn = event.target.closest("[data-rule-remove]");
            if (!removeBtn) return;
            const row = removeBtn.closest("[data-rule-row]");
            if (!row) return;
            row.remove();
            if (!getRuleRows().length) {
                addRule({ attempts: 5, seconds: 60 }, true);
            }
            updateRuleTitles();
            updateRemoveButtons();
            serializeRules(false);
            updateDirtyState();
        });

        throttleRulesContainer.addEventListener("input", (event) => {
            if (!event.target.matches("[data-rule-attempts], [data-rule-seconds]")) return;
            clampInputToMax(event.target);
            serializeRules(false);
            updateDirtyState();
        });

        throttleRulesContainer.addEventListener(
            "blur",
            (event) => {
                if (!event.target.matches("[data-rule-attempts], [data-rule-seconds]")) return;
                normalizeRuleInputs();
                serializeRules(false);
                updateDirtyState();
            },
            true
        );
    }

    if (enabledSwitch) {
        enabledSwitch.addEventListener("change", () => {
            refreshAvailability();
            serializeRules(false);
            updateDirtyState();
        });
    }
    if (userLockEnabled) {
        userLockEnabled.addEventListener("change", () => {
            refreshAvailability();
            serializeRules(false);
            updateDirtyState();
        });
    }
    if (userLockPermanent) {
        userLockPermanent.addEventListener("change", () => {
            syncUserLockMode();
            serializeRules(false);
            updateDirtyState();
        });
    }

    if (userLockAttemptsInput) {
        userLockAttemptsInput.addEventListener("input", () => {
            clampInputToMax(userLockAttemptsInput);
            updateDirtyState();
        });
        userLockAttemptsInput.addEventListener("blur", () => {
            refreshUserLockAttemptsLimit();
            updateDirtyState();
        });
    }
    if (userLockSecondsInput) {
        userLockSecondsInput.addEventListener("input", () => {
            clampInputToMax(userLockSecondsInput);
            updateDirtyState();
        });
        userLockSecondsInput.addEventListener("blur", () => {
            userLockSecondsInput.value = String(clampInt(userLockSecondsInput.value, 60, 86400, 1800));
            updateDirtyState();
        });
    }

    form.addEventListener("input", updateDirtyState);
    form.addEventListener("change", updateDirtyState);

    if (secondaryActionBtn) {
        secondaryActionBtn.addEventListener("click", async () => {
            if (hasUnsavedChanges()) {
                const ok = await askConfirm(t("Hay cambios sin guardar. ¿Quieres cancelarlos y recuperar los últimos valores guardados?"));
                if (!ok) return;
                restoreInitialState();
                await showInfo(t("Cambios descartados."), t("Cancelar cambios"));
                return;
            }

            const ok = await askConfirm(t("Se restablecerán los valores predeterminados de seguridad. ¿Deseas continuar?"));
            if (!ok) return;
            resetToDefaults();
            await showInfo(t("Valores predeterminados restablecidos. Pulsa Guardar seguridad para aplicarlos."), t("Restablecer"));
        });
    }

    form.addEventListener("submit", async (event) => {
        if (allowSubmit) return;
        event.preventDefault();

        if (userLockAttemptsInput) userLockAttemptsInput.disabled = false;
        if (userLockSecondsInput) userLockSecondsInput.disabled = false;

        const { min, max } = getUserLockAttemptsBounds();
        if (userLockAttemptsInput) {
            userLockAttemptsInput.value = String(
                clampInt(userLockAttemptsInput.value, min, max, Math.max(min, 20))
            );
        }
        if (userLockSecondsInput) {
            userLockSecondsInput.value = String(clampInt(userLockSecondsInput.value, 60, 86400, 1800));
        }
        syncUserLockMode();
        serializeRules(true);

        const ok = await askConfirm(t("¿Guardar cambios de seguridad de acceso?"));
        if (!ok) return;

        allowSubmit = true;
        skipUnsavedNavigationGuard = true;
        if (typeof form.requestSubmit === "function") {
            form.requestSubmit(saveBtn || undefined);
        } else {
            form.submit();
        }
    });

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
        const ok = await askConfirm(t("Tienes cambios sin guardar. ¿Deseas salir sin guardar?"));
        if (!ok) return;

        skipUnsavedNavigationGuard = true;
        window.location.href = link.href;
    });

    if (!getRuleRows().length) {
        addRule({ attempts: 5, seconds: 60 }, true);
    }
    updateRuleTitles();
    updateRemoveButtons();
    refreshUserLockAttemptsLimit();
    refreshAvailability();
    serializeRules(false);

    initialSnapshot = getSnapshot();
    updateSecondaryActionButton();
})();
