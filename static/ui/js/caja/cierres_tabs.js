document.addEventListener("DOMContentLoaded", () => {
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetId = tab.dataset.tab;
            const target = document.getElementById(targetId);
            if (!target) return;

            tabs.forEach((item) => item.classList.remove("active"));
            contents.forEach((item) => item.classList.remove("active"));

            tab.classList.add("active");
            target.classList.add("active");
        });
    });
});
