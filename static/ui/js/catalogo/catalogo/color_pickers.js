export function initColorPickers(updateLivePreview) {
    document.querySelectorAll('.color-swatch-btn').forEach(trigger => {
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            const popover = this.closest('.color-picker-component').querySelector('.color-picker-popover');
            const isHidden = popover.classList.contains('hidden');

            document.querySelectorAll('.color-picker-popover').forEach(p => p.classList.add('hidden'));
            if (isHidden) popover.classList.remove('hidden');
        });
    });

    document.querySelectorAll('.popover-close-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            this.closest('.color-picker-popover')?.classList.add('hidden');
        });
    });

    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', function (e) {
            e.stopPropagation();
            const palette = this.closest('.color-palette');
            const popover = this.closest('.color-picker-popover');
            const component = popover.closest('.color-picker-component');
            const triggerId = component.querySelector('.color-swatch-btn').id;
            const targetId = palette.dataset.target;
            const color = this.dataset.color;

            const input = document.getElementById(targetId);
            if (input) input.value = color;

            const trigger = document.getElementById(triggerId);
            if (trigger) {
                const preview = trigger.querySelector('.color-dot');
                if (preview) preview.style.backgroundColor = color;
            }

            palette.querySelectorAll('.swatch').forEach(s => s.classList.remove('is-active'));
            this.classList.add('is-active');

            updateLivePreview();
            popover.classList.add('hidden');
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.color-picker-popover').forEach(p => p.classList.add('hidden'));
    });
}

export function syncSwatches(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const val = input.value.toLowerCase();
    const palette = document.querySelector(`.color-palette[data-target="${inputId}"]`);
    if (!palette) return;

    const popover = palette.closest('.color-picker-popover');
    if (popover) {
        const trigger = popover.closest('.color-picker-component').querySelector('.color-swatch-btn');
        const preview = trigger ? trigger.querySelector('.color-dot') : null;
        if (preview) preview.style.backgroundColor = val;
    }

    palette.querySelectorAll('.swatch').forEach(sw => {
        if (sw.dataset.color.toLowerCase() === val) {
            sw.classList.add('is-active');
        } else {
            sw.classList.remove('is-active');
        }
    });
}

export function resetColor(inputId, defaultColor, updateLivePreview) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = defaultColor;
        syncSwatches(inputId);
        updateLivePreview();
    }
}
