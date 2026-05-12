/**
 * module_loader.js
 * ---------------------------------------------------------------
 * Carga un módulo ES desde una ruta relativa al script que llama,
 * propagando el query param `v` para forzar invalidación de caché.
 *
 * Uso desde un script <script src="...mi-bootstrap.js?v=7">:
 *
 *     window.TpvModuleLoader.loadFromCurrentScript("./app.js", "etiqueta");
 *
 * Se exporta también en `globalThis` para mantener compatibilidad con
 * los antiguos bootstraps por sección (catalogo.js, modificadores.js…).
 * ---------------------------------------------------------------
 */
(function (global) {
    "use strict";

    function loadFromCurrentScript(relativePath, label) {
        const current = document.currentScript;
        if (!current || !current.src) {
            console.error(`No se pudo resolver la ruta del módulo de ${label}.`);
            return;
        }

        const currentUrl = new URL(current.src);
        const moduleUrl = new URL(relativePath, current.src);
        const version = currentUrl.searchParams.get("v");
        if (version) {
            moduleUrl.searchParams.set("v", version);
        }
        const script = document.createElement("script");
        script.type = "module";
        script.src = moduleUrl.toString();
        script.onerror = (error) => {
            console.error(`No se pudo cargar el módulo de ${label}`, error);
        };
        document.head.appendChild(script);
    }

    global.TpvModuleLoader = Object.freeze({
        loadFromCurrentScript,
    });
})(typeof window !== "undefined" ? window : globalThis);
