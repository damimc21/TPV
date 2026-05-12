export const MAP_SKINS = {
    mesa_grande: {
        svg: "Mesa Alargada_TPV-nobg.svg",
    },
    planta: {
        svg: "Maceta_TPV-nobg.svg",
    },
};

export function mapSkinUrl(fileName) {
    return `/static/ui/img/map_icons_clean/${encodeURIComponent(fileName)}`;
}

export function getItemSkin(item) {
    return item?.data?.skin || "svg";
}

export function isTouchPointer(e) {
    return e.pointerType === "touch" || e.pointerType === "pen";
}

export function preventTouchGesture(e) {
    if (isTouchPointer(e) && e.cancelable) e.preventDefault();
}

export function worldPointFromClient(clientX, clientY, canvas, camera) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left - camera.panX) / camera.zoom,
        y: (clientY - rect.top - camera.panY) / camera.zoom,
    };
}

export function touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function touchMidpoint(a, b) {
    return {
        clientX: (a.clientX + b.clientX) / 2,
        clientY: (a.clientY + b.clientY) / 2,
    };
}
