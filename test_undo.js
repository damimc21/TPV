const tpvState = {
    lineas: [],
    historyStack: [],
    historyIndex: 0
};

function saveHistoryState(isInitial = false) {
    const stateParaGuardar = tpvState.lineas.map(l => {
        const { id, ...resto } = l;
        return resto;
    });

    const newStateStr = JSON.stringify(stateParaGuardar);
    console.log("Saving:", newStateStr);

    if (isInitial) {
        tpvState.historyStack = [newStateStr];
        tpvState.historyIndex = 0;
    } else {
        if (
            tpvState.historyStack.length > 0 &&
            tpvState.historyStack[tpvState.historyIndex] === newStateStr
        ) {
            console.log("DUPLICATE, skipping.");
            return;
        }

        if (tpvState.historyIndex < tpvState.historyStack.length - 1) {
            tpvState.historyStack = tpvState.historyStack.slice(0, tpvState.historyIndex + 1);
        }

        tpvState.historyStack.push(newStateStr);
        tpvState.historyIndex++;
    }
}

function printState() {
    console.log(`Index: ${tpvState.historyIndex}, Stack:`, tpvState.historyStack);
}

console.log("INITIAL");
saveHistoryState(true);
printState();

console.log("\nCLICK 1");
tpvState.lineas.push({ _uid: 'l_1', cantidad: 1 });
saveHistoryState();
printState();

console.log("\nCLICK 2");
tpvState.lineas[0].cantidad = 2;
saveHistoryState();
printState();

console.log("\nCLICK 3");
tpvState.lineas[0].cantidad = 3;
saveHistoryState();
printState();

console.log("\nCLICK UNDO 1");
tpvState.historyIndex--;
tpvState.lineas = JSON.parse(tpvState.historyStack[tpvState.historyIndex]);
printState();
console.log("Current lineas view:", tpvState.lineas);

console.log("\nCLICK UNDO 2");
tpvState.historyIndex--;
tpvState.lineas = JSON.parse(tpvState.historyStack[tpvState.historyIndex]);
printState();
console.log("Current lineas view:", tpvState.lineas);

console.log("\nCLICK REDO 1");
tpvState.historyIndex++;
tpvState.lineas = JSON.parse(tpvState.historyStack[tpvState.historyIndex]);
printState();
console.log("Current lineas view:", tpvState.lineas);
