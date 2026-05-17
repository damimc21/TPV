import ast
import sys
from pathlib import Path


def parse_entries(path: Path) -> list[dict]:
    entries = []
    current = {"comments": []}
    last = None

    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped:
            if "msgid" in current or "msgstr" in current:
                entries.append(current)
                current = {"comments": []}
                last = None
            continue

        if stripped.startswith("#"):
            current.setdefault("comments", []).append(stripped)
            continue

        if stripped.startswith("msgid_plural"):
            current["msgid_plural"] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = "msgid_plural"
        elif stripped.startswith("msgid"):
            current["msgid"] = ast.literal_eval(stripped.split(" ", 1)[1])
            last = "msgid"
        elif stripped.startswith("msgstr["):
            index = int(stripped.split("]", 1)[0][7:])
            current.setdefault("msgstr_plural", {})[index] = ast.literal_eval(
                stripped.split(" ", 1)[1]
            )
            last = ("msgstr_plural", index)
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

    return entries


def entry_is_fuzzy(entry: dict) -> bool:
    return any(
        comment.startswith("#,") and "fuzzy" in comment
        for comment in entry.get("comments", [])
    )


def entry_translation(entry: dict) -> str:
    if "msgstr_plural" in entry:
        return "".join(entry["msgstr_plural"].values())
    return entry.get("msgstr", "")


def main() -> int:
    fail_on_pending = "--fail-on-pending" in sys.argv
    paths = [arg for arg in sys.argv[1:] if arg != "--fail-on-pending"]
    root = Path(paths[0]) if paths else Path("locale/en/LC_MESSAGES")
    files = sorted(root.glob("*.po")) if root.is_dir() else [root]
    has_pending = False

    for path in files:
        entries = [
            entry for entry in parse_entries(path)
            if entry.get("msgid") not in (None, "")
        ]
        pending = [
            entry for entry in entries
            if entry_is_fuzzy(entry) or not entry_translation(entry)
        ]
        has_pending = has_pending or bool(pending)
        print(
            f"{path}: {len(entries)} mensajes, "
            f"{len(pending)} pendientes, "
            f"{sum(1 for entry in entries if entry_is_fuzzy(entry))} fuzzy"
        )
        for entry in pending[:20]:
            marker = "fuzzy" if entry_is_fuzzy(entry) else "sin traducir"
            print(f"  - {marker}: {entry['msgid']}")
        if len(pending) > 20:
            print(f"  ... {len(pending) - 20} mas")

    return 1 if has_pending and fail_on_pending else 0


if __name__ == "__main__":
    raise SystemExit(main())
