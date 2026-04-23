(function () {
    "use strict";

    function loadModuleFromCurrentScript(relativePath, label) {
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

    loadModuleFromCurrentScript("./modificadores/app.js", "modificadores");
})();
