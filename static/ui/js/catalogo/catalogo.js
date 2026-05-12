/**
 * Bootstrap del catálogo: delega en TpvModuleLoader.
 * El loader común está en static/ui/js/common/module_loader.js.
 */
(function () {
    "use strict";
    if (!window.TpvModuleLoader) {
        console.error("TpvModuleLoader no está cargado. Incluye common/module_loader.js antes de catalogo.js.");
        return;
    }
    window.TpvModuleLoader.loadFromCurrentScript("./catalogo/app.js", "catálogo");
})();
