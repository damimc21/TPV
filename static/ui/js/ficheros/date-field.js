/* ============================================================
   FICHEROS - Date Field Shared Controller
   ============================================================ */
(function () {
    const SLOT_POS = [0, 1, 3, 4, 6, 7, 8, 9];
    const SLOT_TEMPLATE = ['d', 'd', 'm', 'm', 'a', 'a', 'a', 'a'];
    const BLOCKS = [
        { start: 0, length: 2, max: 31, autoFirstAbove: 3 },
        { start: 2, length: 2, max: 12, autoFirstAbove: 1 },
        { start: 4, length: 4, max: null, autoFirstAbove: null },
    ];

    function isDigit(ch) {
        return /\d/.test(ch);
    }

    function clampToRange(num, min, max) {
        if (num < min) return min;
        if (num > max) return max;
        return num;
    }

    function slotsToValue(slots) {
        return `${slots[0]}${slots[1]}/${slots[2]}${slots[3]}/${slots[4]}${slots[5]}${slots[6]}${slots[7]}`;
    }

    function valueToSlots(value) {
        const slots = SLOT_TEMPLATE.slice();
        const raw = String(value || '');
        SLOT_POS.forEach((pos, i) => {
            const ch = raw[pos];
            if (isDigit(ch)) slots[i] = ch;
        });
        return slots;
    }

    function isValidDisplayDate(value) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''));
        if (!m) return false;
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
        const dt = new Date(y, mo - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
    }

    function formatDateForAPI(displayValue) {
        if (!isValidDisplayDate(displayValue)) return '';
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(displayValue);
        return `${m[3]}-${m[2]}-${m[1]}`;
    }

    function formatDateDisplay(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = String(date.getFullYear()).padStart(4, '0');
        return `${d}/${m}/${y}`;
    }

    function shiftMonths(date, months) {
        const day = date.getDate();
        const base = new Date(date.getFullYear(), date.getMonth() + months, 1);
        const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        return new Date(base.getFullYear(), base.getMonth(), Math.min(day, maxDay));
    }

    function shiftYears(date, years) {
        return shiftMonths(date, years * 12);
    }

    function ensureDateFieldStructure(input, pickerId) {
        let wrapper = input.closest('.fich-date-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'fich-date-wrapper';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);
        }

        let picker = null;
        if (pickerId) picker = document.getElementById(pickerId);
        if (!picker) picker = wrapper.querySelector('.fich-date-native-picker');
        if (!picker) {
            picker = document.createElement('input');
            picker.type = 'date';
            picker.className = 'fich-date-native-picker';
            picker.tabIndex = -1;
            wrapper.appendChild(picker);
        } else if (picker.parentElement !== wrapper) {
            wrapper.appendChild(picker);
        }
        picker.classList.add('fich-date-native-picker');
        picker.tabIndex = -1;

        let pickerBtn = null;
        if (input.id) pickerBtn = wrapper.querySelector(`.fich-date-picker-btn[data-input="${input.id}"]`);
        if (!pickerBtn) pickerBtn = wrapper.querySelector('.fich-date-picker-btn');
        if (!pickerBtn) {
            pickerBtn = document.createElement('button');
            pickerBtn.type = 'button';
            pickerBtn.className = 'fich-date-picker-btn';
            pickerBtn.setAttribute('aria-label', 'Abrir calendario');
            if (input.id) pickerBtn.dataset.input = input.id;
            wrapper.appendChild(pickerBtn);
        } else if (pickerBtn.parentElement !== wrapper) {
            wrapper.appendChild(pickerBtn);
        }
        if (input.id) pickerBtn.dataset.input = input.id;

        return { wrapper, picker, pickerBtn };
    }

    function createFicherosDateField(inputOrId, options = {}) {
        const input = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
        if (!input) return null;

        input.classList.add('fich-date-input-mask');
        input.maxLength = 10;
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('placeholder', 'dd/mm/aaaa');

        const { picker, pickerBtn } = ensureDateFieldStructure(input, options.pickerId);

        let slots = SLOT_TEMPLATE.slice();
        const initial = String(input.value || '');
        if (isValidDisplayDate(initial)) {
            slots = valueToSlots(initial);
            input.dataset.prevValidDisplay = initial;
        }
        let lastCommittedValue = slotsToValue(slots);

        const controller = {
            getIsoValue: () => formatDateForAPI(slotsToValue(slots)),
            getDisplayValueIfValid: () => {
                const value = slotsToValue(slots);
                return isValidDisplayDate(value) ? value : '';
            },
            setDate: (date, cfg = {}) => {
                const display = formatDateDisplay(date);
                if (!display) return;
                slots = valueToSlots(display);
                input.dataset.prevValidDisplay = display;
                render();
                if (cfg.silent) {
                    lastCommittedValue = slotsToValue(slots);
                } else {
                    emitFixed(false);
                }
            },
            setIso: (isoValue, cfg = {}) => {
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoValue || ''));
                if (!m) return;
                const display = `${m[3]}/${m[2]}/${m[1]}`;
                slots = valueToSlots(display);
                input.dataset.prevValidDisplay = display;
                render();
                if (cfg.silent) {
                    lastCommittedValue = slotsToValue(slots);
                } else {
                    emitFixed(false);
                }
            },
        };

        function render() {
            input.value = slotsToValue(slots);
        }

        function hasAnyDigit() {
            return slots.some((ch) => isDigit(ch));
        }

        function isComplete() {
            return slots.every((ch) => isDigit(ch));
        }

        function getBlockRange(blockIdx) {
            const block = BLOCKS[blockIdx];
            const startPos = SLOT_POS[block.start];
            const endPos = SLOT_POS[block.start + block.length - 1] + 1;
            return { startPos, endPos };
        }

        function getBlockIndexFromPos(pos) {
            if (pos <= 1) return 0;
            if (pos <= 4) return 1;
            return 2;
        }

        function setCaretToBlock(blockIdx, selectAll) {
            const safe = clampToRange(blockIdx, 0, 2);
            const range = getBlockRange(safe);
            if (selectAll) input.setSelectionRange(range.startPos, range.endPos);
            else input.setSelectionRange(range.startPos, range.startPos);
        }

        function setBlockDigits(blockIdx, digits) {
            const block = BLOCKS[blockIdx];
            for (let i = 0; i < block.length; i += 1) {
                const slotIdx = block.start + i;
                const ch = digits[i];
                slots[slotIdx] = isDigit(ch) ? ch : SLOT_TEMPLATE[slotIdx];
            }
            render();
        }

        function clearBlock(blockIdx) {
            setBlockDigits(blockIdx, '');
        }

        function getBlockDigits(blockIdx) {
            const block = BLOCKS[blockIdx];
            let digits = '';
            for (let i = 0; i < block.length; i += 1) {
                const ch = slots[block.start + i];
                if (isDigit(ch)) digits += ch;
            }
            return digits;
        }

        function normalizeTwoDigitValue(raw, max) {
            let num = Number.parseInt(raw, 10);
            if (!Number.isFinite(num)) num = 1;
            num = clampToRange(num, 1, max);
            return String(num).padStart(2, '0');
        }

        function finalizePartialBlock(blockIdx) {
            if (blockIdx > 1) return;
            const block = BLOCKS[blockIdx];
            const first = slots[block.start];
            const second = slots[block.start + 1];
            const firstIsDigit = isDigit(first);
            const secondIsDigit = isDigit(second);

            if (firstIsDigit && secondIsDigit) return;
            if (!firstIsDigit && !secondIsDigit) return;

            const digit = firstIsDigit ? first : second;
            const fixed = normalizeTwoDigitValue(`0${digit}`, block.max);
            setBlockDigits(blockIdx, fixed);
        }

        function findSlotAtOrAfter(pos) {
            for (let i = 0; i < SLOT_POS.length; i += 1) {
                if (SLOT_POS[i] >= pos) return i;
            }
            return -1;
        }

        function findSlotBefore(pos) {
            for (let i = SLOT_POS.length - 1; i >= 0; i -= 1) {
                if (SLOT_POS[i] < pos) return i;
            }
            return -1;
        }

        function clearSelectionSlots(startPos, endPos) {
            for (let i = 0; i < SLOT_POS.length; i += 1) {
                const pos = SLOT_POS[i];
                if (pos >= startPos && pos < endPos) {
                    slots[i] = SLOT_TEMPLATE[i];
                }
            }
            render();
        }

        function getSelectedFullBlock() {
            const start = input.selectionStart ?? 0;
            const end = input.selectionEnd ?? 0;
            if (start === end) return -1;

            for (let i = 0; i < BLOCKS.length; i += 1) {
                const range = getBlockRange(i);
                if (start <= range.startPos && end >= range.endPos) return i;
            }
            return -1;
        }

        function emitDirty() {
            if (typeof options.onDirty === 'function') {
                options.onDirty(controller);
            }
        }

        function emitFixed(force) {
            const value = slotsToValue(slots);
            if (!force && value === lastCommittedValue) return;
            lastCommittedValue = value;
            input.dispatchEvent(new Event('date-fixed', { bubbles: true }));
            if (typeof options.onFixed === 'function') {
                options.onFixed(controller);
            }
        }

        function handleDigitKey(digit) {
            const selectedBlock = getSelectedFullBlock();
            const blockIdx = selectedBlock >= 0 ? selectedBlock : getBlockIndexFromPos(input.selectionStart ?? 0);

            if (selectedBlock >= 0) clearBlock(blockIdx);

            if (blockIdx <= 1) {
                const block = BLOCKS[blockIdx];
                const s0 = slots[block.start];
                const s1 = slots[block.start + 1];
                const s0Digit = isDigit(s0);
                const s1Digit = isDigit(s1);

                if (!s0Digit && !s1Digit) {
                    if (Number(digit) > block.autoFirstAbove) {
                        const fixed = normalizeTwoDigitValue(`0${digit}`, block.max);
                        setBlockDigits(blockIdx, fixed);
                        setCaretToBlock(blockIdx + 1, false);
                    } else {
                        setBlockDigits(blockIdx, `${digit}`);
                        const secondPos = SLOT_POS[block.start + 1];
                        input.setSelectionRange(secondPos, secondPos);
                    }
                    emitDirty();
                    return;
                }

                if (s0Digit && !s1Digit) {
                    const fixed = normalizeTwoDigitValue(`${s0}${digit}`, block.max);
                    setBlockDigits(blockIdx, fixed);
                    setCaretToBlock(blockIdx + 1, false);
                    emitDirty();
                    return;
                }

                if (!s0Digit && s1Digit) {
                    const fixed = normalizeTwoDigitValue(`${digit}${s1}`, block.max);
                    setBlockDigits(blockIdx, fixed);
                    setCaretToBlock(blockIdx + 1, false);
                    emitDirty();
                    return;
                }

                clearBlock(blockIdx);
                if (Number(digit) > block.autoFirstAbove) {
                    const fixed = normalizeTwoDigitValue(`0${digit}`, block.max);
                    setBlockDigits(blockIdx, fixed);
                    setCaretToBlock(blockIdx + 1, false);
                } else {
                    setBlockDigits(blockIdx, `${digit}`);
                    const secondPos = SLOT_POS[block.start + 1];
                    input.setSelectionRange(secondPos, secondPos);
                }
                emitDirty();
                return;
            }

            const yearStart = BLOCKS[2].start;
            let yearDigits = '';
            for (let i = 0; i < 4; i += 1) {
                const ch = slots[yearStart + i];
                if (isDigit(ch)) yearDigits += ch;
            }
            if (yearDigits.length >= 4 || selectedBlock === 2) yearDigits = '';
            yearDigits += digit;
            if (yearDigits.length > 4) yearDigits = yearDigits.slice(0, 4);
            setBlockDigits(2, yearDigits);

            if (yearDigits.length < 4) {
                const caretPos = SLOT_POS[yearStart + yearDigits.length];
                input.setSelectionRange(caretPos, caretPos);
            } else {
                setCaretToBlock(2, false);
            }
            emitDirty();
        }

        function handleDeleteKey(key) {
            const start = input.selectionStart ?? 0;
            const end = input.selectionEnd ?? 0;

            if (start !== end) {
                clearSelectionSlots(start, end);
                setCaretToBlock(getBlockIndexFromPos(start), false);
                emitDirty();
                return;
            }

            let slotIdx = -1;
            if (key === 'Backspace') slotIdx = findSlotBefore(start);
            else slotIdx = findSlotAtOrAfter(start);
            if (slotIdx < 0) return;

            slots[slotIdx] = SLOT_TEMPLATE[slotIdx];
            render();
            input.setSelectionRange(SLOT_POS[slotIdx], SLOT_POS[slotIdx]);
            emitDirty();
        }

        function handleSeparatorKey() {
            const blockIdx = getBlockIndexFromPos(input.selectionStart ?? 0);
            const blockDigits = getBlockDigits(blockIdx);
            if (!blockDigits) {
                setCaretToBlock(blockIdx, false);
                return;
            }
            finalizePartialBlock(blockIdx);
            if (blockIdx < 2) setCaretToBlock(blockIdx + 1, false);
            else setCaretToBlock(2, false);
            emitDirty();
        }

        function showInvalidFeedback() {
            input.classList.remove('is-invalid-date');
            void input.offsetWidth;
            input.classList.add('is-invalid-date');
            setTimeout(() => input.classList.remove('is-invalid-date'), 650);
        }

        function revertToLastValidOrEmpty() {
            const current = slotsToValue(slots);
            if (isComplete() && isValidDisplayDate(current)) {
                render();
                return;
            }

            const lastValid = input.dataset.prevValidDisplay || '';
            if (lastValid && isValidDisplayDate(lastValid)) {
                slots = valueToSlots(lastValid);
                render();
                return;
            }

            slots = SLOT_TEMPLATE.slice();
            render();
        }

        render();

        input.addEventListener('focus', () => {
            render();
            const pos = input.selectionStart ?? 0;
            setCaretToBlock(getBlockIndexFromPos(pos), false);
        });

        input.addEventListener('click', () => {
            const pos = input.selectionStart ?? 0;
            if (pos === 2 || pos === 5) setCaretToBlock(getBlockIndexFromPos(pos), false);
        });

        input.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const pos = input.selectionStart ?? 0;
            setCaretToBlock(getBlockIndexFromPos(pos), true);
        });

        input.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter') return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const blockIdx = getBlockIndexFromPos((input.selectionStart ?? 0) - 1);
                setCaretToBlock(blockIdx, false);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const blockIdx = getBlockIndexFromPos((input.selectionStart ?? 0) + 1);
                setCaretToBlock(blockIdx, false);
                return;
            }
            if (e.key === 'Home') {
                e.preventDefault();
                setCaretToBlock(0, false);
                return;
            }
            if (e.key === 'End') {
                e.preventDefault();
                setCaretToBlock(2, false);
                return;
            }
            if (e.key === '/' || e.key === '-' || e.key === '.') {
                e.preventDefault();
                handleSeparatorKey();
                return;
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                handleDeleteKey(e.key);
                return;
            }
            if (/^\d$/.test(e.key)) {
                e.preventDefault();
                handleDigitKey(e.key);
                return;
            }
            if (e.key.length === 1) e.preventDefault();
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text') || '';
            const digits = text.replace(/\D/g, '');
            if (!digits) return;

            if (digits.length >= 8) {
                const dd = normalizeTwoDigitValue(digits.slice(0, 2), 31);
                const mm = normalizeTwoDigitValue(digits.slice(2, 4), 12);
                const yyyy = digits.slice(4, 8);
                slots = valueToSlots(`${dd}/${mm}/${yyyy}`);
                render();
                emitDirty();
                return;
            }

            const blockIdx = getBlockIndexFromPos(input.selectionStart ?? 0);
            clearBlock(blockIdx);
            for (const digit of digits) handleDigitKey(digit);
        });

        input.addEventListener('blur', () => {
            const current = slotsToValue(slots);
            if (isComplete() && isValidDisplayDate(current)) {
                input.dataset.prevValidDisplay = current;
                render();
                emitFixed(false);
                return;
            }

            if (hasAnyDigit()) showInvalidFeedback();
            revertToLastValidOrEmpty();
            emitFixed(false);
        });

        pickerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentIso = formatDateForAPI(slotsToValue(slots));
            if (currentIso) picker.value = currentIso;
            if (typeof picker.showPicker === 'function') picker.showPicker();
            else {
                picker.focus();
                picker.click();
            }
        });

        picker.addEventListener('change', () => {
            if (!picker.value) return;
            controller.setIso(picker.value, { silent: false });
            emitDirty();
        });

        return controller;
    }

    window.createFicherosDateField = createFicherosDateField;
    window.ficherosFormatDateForAPI = formatDateForAPI;
    window.ficherosFormatDateDisplay = formatDateDisplay;
    window.ficherosShiftMonths = shiftMonths;
    window.ficherosShiftYears = shiftYears;

    if (typeof window.formatDateForAPI !== 'function') {
        window.formatDateForAPI = formatDateForAPI;
    }
})();
