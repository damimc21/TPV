import json

tpvState = {
    "lineas": [],
    "historyStack": [],
    "historyIndex": 0
}

def saveHistoryState(isInitial=False):
    # Sanitize
    stateParaGuardar = []
    for l in tpvState["lineas"]:
        resto = l.copy()
        if "id" in resto:
            del resto["id"]
        stateParaGuardar.append(resto)
        
    newStateStr = json.dumps(stateParaGuardar, separators=(',', ':'))
    print("Saving:", newStateStr)
    
    if isInitial:
        tpvState["historyStack"] = [newStateStr]
        tpvState["historyIndex"] = 0
    else:
        if len(tpvState["historyStack"]) > 0 and tpvState["historyStack"][tpvState["historyIndex"]] == newStateStr:
            print("DUPLICATE, skipping.")
            return

        if tpvState["historyIndex"] < len(tpvState["historyStack"]) - 1:
            tpvState["historyStack"] = tpvState["historyStack"][:tpvState["historyIndex"] + 1]

        tpvState["historyStack"].append(newStateStr)
        tpvState["historyIndex"] += 1

def print_state():
    print(f"Index: {tpvState['historyIndex']}, Stack lengths: {[len(x) for x in tpvState['historyStack']]}")

print("INITIAL")
saveHistoryState(True)
print_state()

print("\nCLICK 1")
tpvState["lineas"].append({"_uid": "l_1", "cantidad": 1})
saveHistoryState()
print_state()

print("\nCLICK 2")
tpvState["lineas"][0]["cantidad"] = 2
saveHistoryState()
print_state()

print("\nCLICK 3")
tpvState["lineas"][0]["cantidad"] = 3
saveHistoryState()
print_state()

print("\nCLICK 4")
tpvState["lineas"][0]["cantidad"] = 4
saveHistoryState()
print_state()

print("\nCLICK 5")
tpvState["lineas"][0]["cantidad"] = 5
saveHistoryState()
print_state()
print("Visible lineas:", tpvState["lineas"])

print("\nCLICK UNDO 1")
tpvState["historyIndex"] -= 1
tpvState["lineas"] = json.loads(tpvState["historyStack"][tpvState["historyIndex"]])
print_state()
print("Visible lineas:", tpvState["lineas"])

print("\nCLICK UNDO 2")
tpvState["historyIndex"] -= 1
tpvState["lineas"] = json.loads(tpvState["historyStack"][tpvState["historyIndex"]])
print_state()
print("Visible lineas:", tpvState["lineas"])

print("\nCLICK REDO 1")
tpvState["historyIndex"] += 1
tpvState["lineas"] = json.loads(tpvState["historyStack"][tpvState["historyIndex"]])
print_state()
print("Visible lineas:", tpvState["lineas"])

