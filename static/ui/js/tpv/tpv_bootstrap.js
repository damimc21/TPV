(function () {
    "use strict";

    function readConfig(scriptId) {
        const node = document.getElementById(scriptId);
        if (!node) return {};

        try {
            return JSON.parse(node.textContent || "{}");
        } catch (error) {
            console.error(`tpv_bootstrap: JSON invalido en #${scriptId}`, error);
            return {};
        }
    }

    const cfg = readConfig("tpv-home-config");

    window.ACTIVE_MAP_ID = cfg.activeMapId ?? window.ACTIVE_MAP_ID ?? null;
    window.TPV_DIA_ABIERTO = cfg.diaAbierto ?? window.TPV_DIA_ABIERTO ?? false;
    window.TPV_SESION_ABIERTA = cfg.sesionAbierta ?? window.TPV_SESION_ABIERTA ?? false;
    window.TPV_API_DIA_ABRIR = cfg.apiDiaAbrir ?? window.TPV_API_DIA_ABRIR ?? "/api/dia/abrir/";
    window.TPV_API_CAJA_ABRIR = cfg.apiCajaAbrir ?? window.TPV_API_CAJA_ABRIR ?? "/api/caja/abrir/";
})();
