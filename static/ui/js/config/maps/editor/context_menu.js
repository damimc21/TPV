let ctxMenuEl = null;

export function closeContextMenu() {
    if (ctxMenuEl) {
        ctxMenuEl.remove();
        ctxMenuEl = null;
    }
}

export function showContextMenu(x, y, items) {
    closeContextMenu();

    const menu = document.createElement("div");
    menu.className = "ctx-menu";

    items.forEach((entry) => {
        if (entry === "---") {
            const sep = document.createElement("div");
            sep.className = "ctx-menu__sep";
            menu.appendChild(sep);
            return;
        }

        const btn = document.createElement("button");
        btn.className = "ctx-menu__item";
        if (entry.danger) btn.classList.add("ctx-menu__item--danger");
        if (entry.disabled) btn.disabled = true;
        btn.type = "button";
        btn.innerHTML = `<span>${entry.icon || ''}</span><span>${entry.label}</span>`;
        btn.addEventListener("click", () => {
            closeContextMenu();
            entry.action?.();
        });
        menu.appendChild(btn);
    });

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";

    ctxMenuEl = menu;

    setTimeout(() => {
        function onClickOut(e) {
            if (!menu.contains(e.target)) {
                closeContextMenu();
                window.removeEventListener("pointerdown", onClickOut);
            }
        }
        window.addEventListener("pointerdown", onClickOut);
    }, 0);
}
