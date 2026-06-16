export const MAP_SKINS = {
    planta: {
        svg: "Maceta_TPV.svg",
    },
    taburete: {
        svg: "Taburete TPV.svg",
    },
    llevar: {
        svg: "take-away-svgrepo-com.svg",
    },
    barra: {
        svg: "Barra TPV.svg",
    },
    columna: {
        svg: "Columna TPV.svg",
    },
    cristal_fino: {
        svg: "Cristal fino_TPV.svg",
    },
    cristal_gordo: {
        svg: "Cristal gordo_TPV.svg",
    },
    esquina_muro: {
        svg: "Esquna muro TPV.svg",
    },
    lavamanos: {
        svg: "Lavamanos TPV.svg",
    },
    maceton: {
        svg: "MAcetón_TPV.svg",
    },
    muro: {
        svg: "Muro TPV.svg",
    },
    papelera: {
        svg: "PapeleraoJabón_TPV.svg",
    },
    puerta: {
        svg: "Puerta_TPV.svg",
    },
    wc: {
        svg: "WC TPV.svg",
    },
};

export function mapSkinUrl(fileName) {
    return `/static/ui/img/map_icons/${encodeURIComponent(fileName)}`;
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
