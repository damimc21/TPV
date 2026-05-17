import ast
import struct
import sys
from pathlib import Path


def parse_po(path: Path) -> dict[str, str]:
    entries = []
    current = {"comments": []}
    last = None

    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            if not stripped and ("msgid" in current or "msgstr" in current):
                entries.append(current)
                current = {"comments": []}
                last = None
            elif stripped.startswith("#"):
                current.setdefault("comments", []).append(stripped)
            continue

        if stripped.startswith("msgid_plural"):
            current["msgid_plural"] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = "msgid_plural"
        elif stripped.startswith("msgid"):
            current["msgid"] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = "msgid"
        elif stripped.startswith("msgstr["):
            idx = int(stripped.split("]", 1)[0][7:])
            current.setdefault("msgstr_plural", {})[idx] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = ("msgstr_plural", idx)
        elif stripped.startswith("msgstr"):
            current["msgstr"] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = "msgstr"
        elif stripped.startswith('"') and last is not None:
            value = ast.literal_eval(stripped)
            if isinstance(last, tuple):
                current[last[0]][last[1]] += value
            else:
                current[last] = current.get(last, "") + value

    if "msgid" in current or "msgstr" in current:
        entries.append(current)

    messages = {}
    for entry in entries:
        if "msgid" not in entry:
            continue

        msgid = entry["msgid"]
        is_header = msgid == ""
        if is_header and msgid in messages:
            continue
        is_fuzzy = any(
            comment.startswith("#,") and "fuzzy" in comment
            for comment in entry.get("comments", [])
        )
        if is_fuzzy and not is_header:
            continue

        if "msgid_plural" in entry:
            plural = entry.get("msgstr_plural", {})
            if not plural or any(not value for value in plural.values()):
                continue
            msgid = msgid + "\0" + entry["msgid_plural"]
            msgstr = "\0".join(
                plural.get(i, "") for i in range(max(plural.keys(), default=-1) + 1)
            )
        else:
            msgstr = entry.get("msgstr", "")
            if not msgstr and not is_header:
                continue
        messages[msgid] = msgstr
    return messages


def write_mo(messages: dict[str, str], path: Path) -> None:
    keys = sorted(messages)
    ids = b""
    strs = b""
    offsets = []
    str_offsets = []

    for key in keys:
        encoded = key.encode("utf-8")
        offsets.append((len(encoded), len(ids)))
        ids += encoded + b"\0"

    for key in keys:
        encoded = messages[key].encode("utf-8")
        str_offsets.append((len(encoded), len(strs)))
        strs += encoded + b"\0"

    count = len(keys)
    key_start = 7 * 4
    value_start = key_start + count * 8
    id_start = value_start + count * 8
    str_start = id_start + len(ids)

    output = [struct.pack("Iiiiiii", 0x950412DE, 0, count, key_start, value_start, 0, 0)]
    output.extend(struct.pack("ii", length, id_start + offset) for length, offset in offsets)
    output.extend(struct.pack("ii", length, str_start + offset) for length, offset in str_offsets)
    output.extend([ids, strs])
    path.write_bytes(b"".join(output))


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: compile_po_to_mo.py input.po output.mo", file=sys.stderr)
        return 2
    po_path = Path(sys.argv[1])
    mo_path = Path(sys.argv[2])
    messages = parse_po(po_path)
    write_mo(messages, mo_path)
    print(f"compiled {len(messages)} messages to {mo_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
