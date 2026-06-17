(function () {
    "use strict";

    function readConfig(scriptId) {
        const node = document.getElementById(scriptId);
        if (!node) return {};
        try {
            return JSON.parse(node.textContent || "{}");
        } catch (error) {
            console.error(`reaperturas.js: JSON invalido en #${scriptId}`, error);
            return {};
        }
    }

    const cfg = readConfig("reaperturas-config");
    const Notify = window.Notify;

    function getHeaders() {
        return {
            "X-CSRFToken": cfg.csrfToken || "",
            "Content-Type": "application/json",
        };
    }

    function buildUrl(urlTemplate, id) {
        if (!urlTemplate) return "";
        return urlTemplate.replace(/\/0\/?$/, `/${id}/`);
    }

    function setupTabs() {
        const tabs = document.querySelectorAll(".tab-btn");
        const contents = document.querySelectorAll(".tab-content");

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const targetId = tab.dataset.tab;
                const target = document.getElementById(targetId);
                if (!target) return;

                tabs.forEach((item) => item.classList.remove("active"));
                contents.forEach((item) => item.classList.remove("active"));

                tab.classList.add("active");
                target.classList.add("active");
            });
        });
    }

    async function postReopen(url) {
        const response = await fetch(url, {
            method: "POST",
            headers: getHeaders(),
        });
        return response.json();
    }

    window.reabrirDia = async function reabrirDia(id) {
        const confirmed = await Notify.confirm(
            cfg.confirmReopenDay || "¿Estas seguro de que quieres reabrir esta jornada?",
            { title: "Confirmar" }
        );
        if (!confirmed) return;

        const url = buildUrl(cfg.diaReabrirUrlTemplate, id);
        try {
            const data = await postReopen(url);
            if (data.ok) {
                await Notify.success(cfg.reopenDaySuccess || "Jornada reabierta correctamente.", {
                    title: cfg.successTitle || "Exito",
                });
                location.reload();
            } else {
                await Notify.error(data.error || cfg.reopenDayError || "Error al reabrir la jornada.", {
                    title: cfg.warningTitle || "Atencion",
                });
            }
        } catch (error) {
            console.error("Error:", error);
            await Notify.error(cfg.reopenDayConnectionError || "Error de conexion al reabrir la jornada.", {
                title: cfg.errorTitle || "Error",
            });
        }
    };

    window.reabrirTurno = async function reabrirTurno(id) {
        const confirmed = await Notify.confirm(
            cfg.confirmReopenShift || "¿Estas seguro de que quieres reabrir este turno?",
            { title: "Confirmar" }
        );
        if (!confirmed) return;

        const url = buildUrl(cfg.turnoReabrirUrlTemplate, id);
        try {
            const data = await postReopen(url);
            if (data.ok) {
                const mensaje = data.jornada_reabierta
                    ? (cfg.reopenShiftAndDaySuccess || "Turno y jornada reabiertos correctamente.")
                    : (cfg.reopenShiftSuccess || "Turno reabierto correctamente.");
                await Notify.success(mensaje, {
                    title: cfg.successTitle || "Exito",
                });
                location.reload();
            } else {
                await Notify.error(data.error || cfg.reopenShiftError || "Error al reabrir el turno.", {
                    title: cfg.warningTitle || "Atencion",
                });
            }
        } catch (error) {
            console.error("Error:", error);
            await Notify.error(cfg.reopenShiftConnectionError || "Error de conexion al reabrir el turno.", {
                title: cfg.errorTitle || "Error",
            });
        }
    };

    document.addEventListener("DOMContentLoaded", setupTabs);
})();
