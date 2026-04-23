document.addEventListener("DOMContentLoaded", () => {
    function readConfig(scriptId) {
        const node = document.getElementById(scriptId);
        if (!node) return {};
        try {
            return JSON.parse(node.textContent || "{}");
        } catch (error) {
            console.error(`estadisticas.js: JSON invalido en #${scriptId}`, error);
            return {};
        }
    }

    const cfg = readConfig("estadisticas-config");
    const labels = cfg.labels || {};

    if (typeof Chart === "undefined") {
        console.error("Chart.js no está disponible.");
        return;
    }

    Chart.defaults.color = "rgba(255, 255, 255, 0.7)";
    Chart.defaults.borderColor = "rgba(255, 255, 255, 0.1)";
    Chart.defaults.font.family = "'Inter', sans-serif";

    const tendenciaCtx = document.getElementById("chartTendencia");
    if (tendenciaCtx && cfg.chartTendencia) {
        new Chart(tendenciaCtx, {
            type: "line",
            data: {
                labels: cfg.chartTendencia.labels,
                datasets: [{
                    label: labels.salesEuro || "Ventas (€)",
                    data: cfg.chartTendencia.data,
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: (v) => `${v}€` } },
                },
            },
        });
    }

    const pagosCtx = document.getElementById("chartPagos");
    if (pagosCtx && cfg.chartPagos) {
        new Chart(pagosCtx, {
            type: "doughnut",
            data: {
                labels: cfg.chartPagos.labels,
                datasets: [{
                    data: cfg.chartPagos.data,
                    backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ec4899"],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom" },
                },
            },
        });
    }

    const categoriasCtx = document.getElementById("chartCategorias");
    if (categoriasCtx && cfg.chartCategorias) {
        new Chart(categoriasCtx, {
            type: "bar",
            data: {
                labels: cfg.chartCategorias.labels,
                datasets: [{
                    label: labels.salesEuro || "Ventas (€)",
                    data: cfg.chartCategorias.data,
                    backgroundColor: "rgba(59, 130, 246, 0.6)",
                    borderRadius: 8,
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
            },
        });
    }

    const productosCtx = document.getElementById("chartProductos");
    if (productosCtx && cfg.chartProductos) {
        new Chart(productosCtx, {
            type: "bar",
            data: {
                labels: cfg.chartProductos.labels,
                datasets: [{
                    label: labels.units || "Unidades",
                    data: cfg.chartProductos.data,
                    backgroundColor: "rgba(245, 158, 11, 0.6)",
                    borderRadius: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
            },
        });
    }
});
