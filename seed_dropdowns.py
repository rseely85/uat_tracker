"""
seed_dropdowns.py
Reads the UAT mapping from Sheet2 of UAT lists.xlsx and populates
all 6 dropdown levels in the uat_tracker DB.

Run from the uat_tracker project root:
  .venv/bin/python3 seed_dropdowns.py

WARNING: This will DELETE all existing dropdown items, test cases,
         groups, runs, and results before inserting fresh data.
"""

import sqlite3
import openpyxl
from pathlib import Path

DB_PATH   = Path(__file__).parent / "uat_tracker.db"
XLSX_PATH = Path.home() / "Desktop" / "UAT lists.xlsx"

# ── helpers ──────────────────────────────────────────────────────────

def clean(v):
    """Strip, normalise None to empty string."""
    return v.strip() if isinstance(v, str) else ""

def strip_parens(v):
    """'(dashboard)' → 'dashboard'"""
    s = clean(v)
    return s.strip("()").strip()

# ── main ─────────────────────────────────────────────────────────────

def seed():
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb["Sheet2"]
    rows = [r for r in ws.iter_rows(values_only=True)]
    data = rows[1:]   # skip header row

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")   # we do manual cascade below

    # ── wipe existing data ──────────────────────────────────────────
    print("Clearing existing data…")
    for tbl in ("test_results", "test_runs", "test_group_cases",
                "test_groups", "test_cases", "dropdown_items"):
        conn.execute(f"DELETE FROM {tbl}")
    conn.execute("DELETE FROM sqlite_sequence")   # reset auto-increment
    conn.commit()

    # ── insert helper ───────────────────────────────────────────────
    # item_map: (level, value_lower, parent_id) → item_id
    item_map: dict = {}

    def insert(level: int, value: str, parent_id, order: int = 0) -> int:
        v = value.strip()
        key = (level, v.lower(), parent_id)
        if key in item_map:
            return item_map[key]
        cur = conn.execute(
            "INSERT INTO dropdown_items (dropdown_num, value, parent_item_id, sort_order)"
            " VALUES (?,?,?,?)",
            (level, v, parent_id, order)
        )
        iid = cur.lastrowid
        item_map[key] = iid
        return iid

    def find(level: int, value: str, parent_id=None):
        v = value.strip().lower()
        key = (level, v, parent_id)
        if key in item_map:
            return item_map[key]
        # fallback: any parent
        for k, iid in item_map.items():
            if k[0] == level and k[1] == v:
                return iid
        return None

    # ── Level 1 — Applications ──────────────────────────────────────
    print("Level 1: Applications")
    apps = ["Windows", "Mac", "Codebase"]
    for i, app in enumerate(apps):
        insert(1, app, None, i)

    # ── Level 2 — Testing Groups (col 2 = app parent, col 3 = group) ─
    print("Level 2: Testing Groups")
    seen_tg = set()
    for row in data:
        app_name   = clean(row[2])   # e.g. "windows" / "Mac" / "Codebase"
        group_name = clean(row[3])
        if not app_name or not group_name:
            continue
        app_id = find(1, app_name)
        if app_id is None:
            print(f"  WARN: unknown app '{app_name}'")
            continue
        key = (group_name.lower(), app_id)
        if key not in seen_tg:
            insert(2, group_name, app_id)
            seen_tg.add(key)

    # ── Level 3 — Function Groups (col 6 = value; parent = "menu Item" per app) ─
    # All function items sit under "menu Item" testing group.
    # We replicate them under menu Item > Windows, > Mac, > Codebase.
    print("Level 3: Function Groups")
    func_items_ordered = []
    seen_fi = set()
    for row in data:
        fi = clean(row[6])
        if fi and fi.lower() not in seen_fi:
            func_items_ordered.append(fi)
            seen_fi.add(fi.lower())

    for app in apps:
        app_id = find(1, app)
        mi_id  = find(2, "menu item", app_id)   # "menu Item" under this app
        if mi_id is None:
            print(f"  WARN: 'menu Item' testing group not found for {app}")
            continue
        for i, fi in enumerate(func_items_ordered):
            insert(3, fi, mi_id, i)

    # ── Level 4 — Sections (col 8 = function-item parent, col 9 = section) ─
    # Build: func_item_name → [unique section names in order]
    print("Level 4: Sections")
    sections_by_func: dict[str, list] = {}
    for row in data:
        parent_fi = clean(row[8])
        section   = clean(row[9])
        if not parent_fi or not section:
            continue
        key_fi = parent_fi.lower()
        if key_fi not in sections_by_func:
            sections_by_func[key_fi] = []
        if section.lower() not in [s.lower() for s in sections_by_func[key_fi]]:
            sections_by_func[key_fi].append(section)

    for app in apps:
        app_id = find(1, app)
        mi_id  = find(2, "menu item", app_id)
        if mi_id is None:
            continue
        for fi_name, section_list in sections_by_func.items():
            fi_id = find(3, fi_name, mi_id)
            if fi_id is None:
                print(f"  WARN: function item '{fi_name}' not found under menu Item > {app}")
                continue
            for i, sect in enumerate(section_list):
                insert(4, sect, fi_id, i)

    # ── Level 5 — Field/Button ──────────────────────────────────────
    # col 11 = "(function_item)" context (grandparent)
    # col 12 = section name (parent)
    # col 13 = field value
    print("Level 5: Field / Button")
    fields_data = []
    for row in data:
        func_ctx  = strip_parens(row[11])
        sect_name = clean(row[12])
        field_val = clean(row[13])
        if sect_name and field_val:
            fields_data.append((func_ctx, sect_name, field_val))

    for app in apps:
        app_id = find(1, app)
        mi_id  = find(2, "menu item", app_id)
        if mi_id is None:
            continue
        for func_ctx, sect_name, field_val in fields_data:
            fi_id   = find(3, func_ctx, mi_id) if func_ctx else None
            if fi_id is None:
                continue
            sect_id = find(4, sect_name, fi_id)
            if sect_id is None:
                continue
            insert(5, field_val, sect_id)

    # ── Level 6 — Function 1 ────────────────────────────────────────
    # col 15 = "(function_item)" context
    # col 16 = "(section)" context
    # col 17 = field/button parent name
    # col 18 = Function 1 value
    print("Level 6: Function 1")
    func1_data = []
    for row in data:
        func_ctx  = strip_parens(row[15])
        sect_ctx  = strip_parens(row[16])
        field_par = clean(row[17])
        func1_val = clean(row[18])
        if field_par and func1_val:
            func1_data.append((func_ctx, sect_ctx, field_par, func1_val))

    for app in apps:
        app_id = find(1, app)
        mi_id  = find(2, "menu item", app_id)
        if mi_id is None:
            continue
        for func_ctx, sect_ctx, field_par, func1_val in func1_data:
            fi_id   = find(3, func_ctx, mi_id) if func_ctx else None
            if fi_id is None:
                continue
            sect_id = find(4, sect_ctx, fi_id) if sect_ctx else None
            if sect_id is None:
                continue
            field_id = find(5, field_par, sect_id)
            if field_id is None:
                continue
            insert(6, func1_val, field_id)

    conn.commit()

    # ── summary ─────────────────────────────────────────────────────
    print("\n✓ Seed complete. Item counts by level:")
    for lv in range(1, 8):
        cnt = conn.execute(
            "SELECT COUNT(*) FROM dropdown_items WHERE dropdown_num=?", (lv,)
        ).fetchone()[0]
        if cnt:
            print(f"  Level {lv}: {cnt} items")

    conn.close()


if __name__ == "__main__":
    seed()
