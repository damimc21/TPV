(function () {
    "use strict";

    try {
        const savedTheme = localStorage.getItem("tpv_theme");
        document.documentElement.setAttribute("data-theme", savedTheme || "dark");
    } catch (_error) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
})();
