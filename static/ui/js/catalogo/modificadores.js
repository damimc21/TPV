/**
 * Bootstrap de modificadores: delega en TpvModuleLoader.
 * El loader común está en static/ui/js/common/module_loader.js.
 */
(function () {
    "use strict";
    if (!window.TpvModuleLoader) {
        console.error("TpvModuleLoader no está cargado. Incluye common/module_loader.js antes de modificadores.js.");
        return;
    }
    window.TpvModuleLoader.loadFromCurrentScript("./modificadores/app.js", "modificadores");
})();
