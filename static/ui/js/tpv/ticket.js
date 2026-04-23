// Gestion de impresion del ticket.
// Calcula base/IVA para comprobantes provisionales y abre el dialogo de impresion.
(function () {
  "use strict";

  function readConfig(scriptId) {
    const node = document.getElementById(scriptId);
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || "{}");
    } catch (error) {
      console.error(`ticket.js: JSON invalido en #${scriptId}`, error);
      return {};
    }
  }

  function renderProvisionalTaxBreakdown() {
    const valBaseImponible = document.getElementById("valBaseImponible");
    const valIVA = document.getElementById("valIVA");
    if (!valBaseImponible || !valIVA) return;

    const cfg = readConfig("ticket-config");
    const total = Number(String(cfg.totalProvisional ?? "0").replace(",", "."));
    const ivaRate = Number(cfg.ivaRate ?? 0.10);
    if (!Number.isFinite(total) || !Number.isFinite(ivaRate) || ivaRate <= 0) return;

    const base = total / (1 + ivaRate);
    const iva = total - base;

    valBaseImponible.textContent = `${base.toFixed(2).replace(".", ",")} €`;
    valIVA.textContent = `${iva.toFixed(2).replace(".", ",")} €`;
  }

  window.addEventListener("load", () => {
    renderProvisionalTaxBreakdown();
    window.print();
  });
})();
