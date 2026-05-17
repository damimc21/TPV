/* ============================================================
   BACKUPS - Logica JS
   ============================================================ */
(function () {
    const gettext = typeof window !== 'undefined' && typeof window.gettext === 'function'
        ? window.gettext
        : (text) => text;

    document.addEventListener("DOMContentLoaded", () => {
        initAutoBackupSelect();
    });

    function getCookie(name) {
        return window.TpvUtils ? window.TpvUtils.getCookie(name) : null;
    }

    function initAutoBackupSelect() {
        const trigger = document.getElementById("autoBackupTrigger");
        const menu = document.getElementById("autoBackupOptions");
        const input = document.getElementById("autoBackupIntervalo");
        const label = document.getElementById("autoBackupLabel");
        if (!trigger || !menu || !input || !label) return;

        const selected = menu.querySelector(`.fich-custom-select__option[data-value="${input.value}"]`)
            || menu.querySelector(".fich-custom-select__option.is-selected")
            || menu.querySelector(".fich-custom-select__option");
        if (selected) {
            input.value = selected.dataset.value || "0";
            label.textContent = selected.textContent || gettext("Deshabilitado");
            selected.classList.add("is-selected");
        }

        trigger.addEventListener("click", (event) => {
            event.stopPropagation();
            const willOpen = menu.classList.contains("hidden");
            closeAutoBackupSelect();
            if (willOpen) {
                menu.classList.remove("hidden");
                trigger.setAttribute("aria-expanded", "true");
            }
        });

        menu.addEventListener("click", async (event) => {
            const option = event.target.closest(".fich-custom-select__option");
            if (!option) return;
            input.value = option.dataset.value || "0";
            label.textContent = option.textContent || gettext("Deshabilitado");
            menu.querySelectorAll(".fich-custom-select__option").forEach((opt) => {
                opt.classList.toggle("is-selected", opt === option);
            });
            closeAutoBackupSelect();
            await window.guardarAutoBackup();
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest("#autoBackupSelect")) closeAutoBackupSelect();
        });
    }

    function closeAutoBackupSelect() {
        const menu = document.getElementById("autoBackupOptions");
        const trigger = document.getElementById("autoBackupTrigger");
        if (menu) menu.classList.add("hidden");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
    }

    window.crearBackup = async () => {
        const ok = await Notify.confirm(
            gettext("Se creará una copia completa de la base de datos y se guardará en el servidor. Puedes descargarla desde el historial cuando termine."),
            {
                title: gettext("Crear backup"),
                confirmText: gettext("Crear backup"),
                cancelText: gettext("Cancelar"),
            }
        );
        if (!ok) return;

        const btn = document.getElementById("btnCrearBackup");
        btn.disabled = true;
        btn.textContent = gettext("Creando backup...");

        try {
            const resp = await fetch("/api/ficheros/backup/crear/", {
                method: "POST",
                headers: { "X-CSRFToken": getCookie("csrftoken") },
            });
            const data = await resp.json();
            if (data.ok) {
                await Notify.success(`${gettext("Backup creado")}: ${data.nombre}`, { title: gettext("Backup") });
                location.reload();
            } else {
                await Notify.error(`${gettext("Error")}: ${data.error}`);
            }
        } catch (e) {
            await Notify.error(gettext("Error de conexión"));
        } finally {
            btn.disabled = false;
            btn.textContent = gettext("Crear backup ahora");
        }
    };

    window.descargarBackup = (filename) => {
        window.location.href = `/api/ficheros/backup/descargar/${encodeURIComponent(filename)}/`;
    };

    window.restaurarBackup = async (filename) => {
        const firstConfirm = await Notify.confirmDanger(
            `${gettext("Atención")}: ${gettext("Esto restaurará la base de datos al estado del backup")} "${filename}".\n\n${gettext("Se creará un backup de seguridad del estado actual antes de restaurar.")}\n\n${gettext("¿Estás seguro?")}`,
            { title: gettext("Restaurar backup") }
        );
        if (!firstConfirm) return;

        const secondConfirm = await Notify.confirmDanger(
            `${gettext("Confirmación final")}: ${gettext("Esta operación es irreversible.")}\n\n${gettext("¿Continuar con la restauración?")}`,
            { title: gettext("Confirmación final") }
        );
        if (!secondConfirm) return;

        await restaurarBackupAPI(filename);
    };

    async function restaurarBackupAPI(filename) {
        try {
            const resp = await fetch("/api/ficheros/backup/restaurar/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken"),
                },
                body: JSON.stringify({ filename }),
            });
            const data = await resp.json();
            if (data.ok) {
                await Notify.success(gettext("Backup restaurado correctamente. La página se recargará."), { title: gettext("Backup") });
                location.reload();
            } else {
                await Notify.error(`${gettext("Error")}: ${data.error}`);
            }
        } catch (e) {
            await Notify.error(gettext("Error de conexión"));
        }
    }

    window.guardarAutoBackup = async () => {
        const intervalo = document.getElementById("autoBackupIntervalo").value;
        const status = document.getElementById("autoStatus");
        try {
            const resp = await fetch("/api/configuracion/update/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken"),
                },
                body: JSON.stringify({ clave: "backup_auto_intervalo", valor: intervalo }),
            });
            if (resp.ok) {
                status.textContent = intervalo === "0" ? gettext("Deshabilitado") : gettext("Guardado");
                setTimeout(() => {
                    status.textContent = "";
                }, 2000);
            }
        } catch (e) {
            status.textContent = gettext("Error");
        }
    };
})();
