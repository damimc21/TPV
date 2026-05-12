/**
 * Bootstrap de importacion de ficheros: delega en TpvModuleLoader.
 * El loader comun esta en static/ui/js/common/module_loader.js.
 */
(function () {
    "use strict";
    if (!window.TpvModuleLoader) {
        console.error("TpvModuleLoader no esta cargado. Incluye common/module_loader.js antes de importar.js.");
        return;
    }
    window.TpvModuleLoader.loadFromCurrentScript("./importar/app.js", "importacion de ficheros");
})();
