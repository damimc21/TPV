/* ============================================================
   BACKUPS - Logica JS
   ============================================================ */
(function () {
    function getCookie(name) {
        let v = null;
        document.cookie.split(";").forEach((c) => {
            const [k, val] = c.trim().split("=");
            if (k === name) v = decodeURIComponent(val);
        });
        return v;
    }

    window.crearBackup = async () => {
        const btn = document.getElementById("btnCrearBackup");
        btn.disabled = true;
        btn.textContent = "Creando backup...";

        try {
            const resp = await fetch("/api/ficheros/backup/crear/", {
                method: "POST",
                headers: { "X-CSRFToken": getCookie("csrftoken") },
            });
            const data = await resp.json();
            if (data.ok) {
                await Notify.success(`Backup creado: ${data.nombre}`, { title: "Backup" });
                location.reload();
            } else {
                await Notify.error(`Error: ${data.error}`);
            }
        } catch (e) {
            await Notify.error("Error de conexion");
        } finally {
            btn.disabled = false;
            btn.textContent = "Crear backup ahora";
        }
    };

    window.descargarBackup = (filename) => {
        window.location.href = `/api/ficheros/backup/descargar/${encodeURIComponent(filename)}/`;
    };

    window.restaurarBackup = async (filename) => {
        const firstConfirm = await Notify.confirmDanger(
            `ATENCION: Esto restaurara la base de datos al estado del backup "${filename}".\n\nSe creara un backup de seguridad del estado actual antes de restaurar.\n\n¿Estas seguro?`,
            { title: "Restaurar backup" }
        );
        if (!firstConfirm) return;

        const secondConfirm = await Notify.confirmDanger(
            "CONFIRMACION FINAL: Esta operacion es irreversible.\n\n¿Continuar con la restauracion?",
            { title: "Confirmacion final" }
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
                await Notify.success("Backup restaurado correctamente. La pagina se recargara.", { title: "Backup" });
                location.reload();
            } else {
                await Notify.error(`Error: ${data.error}`);
            }
        } catch (e) {
            await Notify.error("Error de conexion");
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
                status.textContent = intervalo === "0" ? "Deshabilitado" : "Guardado";
                setTimeout(() => {
                    status.textContent = "";
                }, 2000);
            }
        } catch (e) {
            status.textContent = "Error";
        }
    };
})();
