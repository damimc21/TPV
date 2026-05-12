/**
 * utils.js
 * ---------------------------------------------------------------
 * Pequeño namespace de utilidades para el front del TPV.
 * Expuesto como `window.TpvUtils` para que cualquier script pueda usarlo
 * sin importar módulos. Pensado para eliminar duplicidades del estilo
 * "getCookie", "getCSRFToken", encabezados con CSRF, etc.
 *
 * API pública:
 *
 *   TpvUtils.getCookie(name)         -> string | null
 *   TpvUtils.getCSRFToken()          -> string ("" si no hay)
 *   TpvUtils.csrfHeaders(extra?)     -> object con X-CSRFToken (+ extras)
 *   TpvUtils.jsonHeaders(extra?)     -> object con X-CSRFToken y Content-Type JSON
 *   TpvUtils.fetchJSON(url, opts?)   -> Promise<any> (lanza Error con .status)
 *   TpvUtils.logUiEvent(...)         -> void (envio fire-and-forget)
 *
 * No hace falta importar nada: este script se carga en base.html.
 * ---------------------------------------------------------------
 */
(function (global) {
    "use strict";

    function getCookie(name) {
        if (typeof document === "undefined" || !document.cookie) return null;
        const cookies = document.cookie.split(";");
        for (const raw of cookies) {
            const cookie = raw.trim();
            if (!cookie) continue;
            const eq = cookie.indexOf("=");
            const key = eq === -1 ? cookie : cookie.slice(0, eq);
            if (key === name) {
                const value = eq === -1 ? "" : cookie.slice(eq + 1);
                try {
                    return decodeURIComponent(value);
                } catch (_) {
                    return value;
                }
            }
        }
        return null;
    }

    function getCSRFToken() {
        return getCookie("csrftoken") || "";
    }

    function csrfHeaders(extra) {
        return Object.assign({ "X-CSRFToken": getCSRFToken() }, extra || {});
    }

    function jsonHeaders(extra) {
        return Object.assign(
            { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
            extra || {}
        );
    }

    async function fetchJSON(url, opts) {
        const options = Object.assign({}, opts || {});
        const method = (options.method || "GET").toUpperCase();
        const needsCSRF = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
        const baseHeaders = needsCSRF ? csrfHeaders() : {};
        options.headers = Object.assign({}, baseHeaders, options.headers || {});

        const response = await fetch(url, options);
        const text = await response.text();
        let payload = null;
        if (text) {
            try { payload = JSON.parse(text); } catch (_) { payload = text; }
        }
        if (!response.ok) {
            const err = new Error(
                (payload && typeof payload === "object" && payload.error) ||
                response.statusText ||
                `HTTP ${response.status}`
            );
            err.status = response.status;
            err.payload = payload;
            throw err;
        }
        return payload;
    }

    function logUiEvent(evento, detalle, nivel, origen) {
        if (typeof fetch !== "function") return;
        fetch("/api/ficheros/logs/ui-evento/", {
            method: "POST",
            keepalive: true,
            headers: jsonHeaders(),
            body: JSON.stringify({
                evento,
                detalle,
                nivel: nivel || "INFO",
                origen: origen || "ui",
            }),
        }).catch(() => { });
    }

    global.TpvUtils = Object.freeze({
        getCookie,
        getCSRFToken,
        csrfHeaders,
        jsonHeaders,
        fetchJSON,
        logUiEvent,
    });
})(typeof window !== "undefined" ? window : globalThis);
