/* modal.js - puente a modales comunes de la app. */

/**
 * Prompt unificado de aplicacion.
 * Delega en Notify.prompt para mantener un solo sistema visual/arquitectura.
 *
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {Object} [opts]
 * @returns {Promise<string|null>}
 */
export function showPrompt(message, defaultValue = "", opts = {}) {
    const notify = window.Notify;
    if (!notify || typeof notify.prompt !== "function") {
        throw new Error("Notify.prompt no disponible para mostrar prompt.");
    }
    return notify.prompt(message, defaultValue, opts);
}
