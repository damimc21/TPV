function cloneItem(item) {
    return JSON.parse(JSON.stringify(item));
}

export function copySelectedItems(items, selectedIds) {
    if (selectedIds.size === 0) return [];
    return (items || [])
        .filter((it) => selectedIds.has(it.id))
        .map(cloneItem);
}

export function pasteItems({ items, clipboard, lastWorldMouse, uid, getTypePrefix, nextFreeNumero }) {
    if (clipboard.length === 0) return new Set();

    let cx = 0;
    let cy = 0;
    for (const it of clipboard) {
        cx += it.x;
        cy += it.y;
    }
    cx /= clipboard.length;
    cy /= clipboard.length;

    const dx = lastWorldMouse.x - cx;
    const dy = lastWorldMouse.y - cy;
    const newIds = new Set();

    clipboard.forEach((orig) => {
        const clone = cloneItem(orig);
        clone.id = uid();
        clone.x = Math.round(clone.x + dx);
        clone.y = Math.round(clone.y + dy);

        const prefix = getTypePrefix(clone.type);
        if (prefix) {
            clone.data = clone.data || {};
            clone.data.numero = nextFreeNumero(prefix);
        }

        items.push(clone);
        newIds.add(clone.id);
    });

    return newIds;
}

export function duplicateItems({ items, selectedIds, uid, getTypePrefix, nextFreeNumero, offset = 20 }) {
    if (selectedIds.size === 0) return new Set();

    const newIds = new Set();
    const originals = (items || []).filter((it) => selectedIds.has(it.id));

    originals.forEach((orig) => {
        const clone = cloneItem(orig);
        clone.id = uid();
        clone.x += offset;
        clone.y += offset;

        const prefix = getTypePrefix(clone.type);
        if (prefix) {
            clone.data = clone.data || {};
            clone.data.numero = nextFreeNumero(prefix);
        }

        items.push(clone);
        newIds.add(clone.id);
    });

    return newIds;
}
