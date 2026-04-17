"""
seed_test_cases.py
Creates one test case per leaf node in the dropdown hierarchy.

A leaf is the deepest populated level for each path:
  - Level 6 items (237) — deepest, no Level 7 data
  - Level 5 items with no Level 6 children (153)
  - Level 4 items with no Level 5 children (15)
  - Level 3 items with no Level 4 children (6)

Total: 411 test cases.

Run from the uat_tracker project root:
  .venv/bin/python3 seed_test_cases.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "uat_tracker.db"


def seed():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")

    # ── load all dropdown items into memory ──────────────────────────
    items = {
        row["item_id"]: dict(row)
        for row in conn.execute("SELECT * FROM dropdown_items")
    }

    # ── helper: walk parent chain, return dict of level→item_id ──────
    def path_ids(item_id: int) -> dict:
        ids = {}
        iid = item_id
        while iid:
            item = items.get(iid)
            if not item:
                break
            ids[item["dropdown_num"]] = iid
            iid = item["parent_item_id"]
        return ids

    # ── helper: human-readable path label ────────────────────────────
    def path_label(item_id: int) -> str:
        parts = []
        iid = item_id
        while iid:
            item = items.get(iid)
            if not item:
                break
            parts.append(item["value"])
            iid = item["parent_item_id"]
        parts.reverse()
        return " > ".join(parts)

    # ── find leaves at each level ─────────────────────────────────────
    # items that have children at the NEXT level
    has_children = set(
        row[0]
        for row in conn.execute(
            "SELECT DISTINCT parent_item_id FROM dropdown_items "
            "WHERE parent_item_id IS NOT NULL"
        )
    )

    leaves = [
        item
        for item in items.values()
        if item["item_id"] not in has_children   # no children → leaf
        and item["dropdown_num"] >= 3             # at least down to function group
    ]

    print(f"Found {len(leaves)} leaf nodes across all levels.")

    # ── wipe existing test cases (keep dropdown data intact) ──────────
    print("Clearing existing test cases…")
    conn.execute("DELETE FROM test_results")
    conn.execute("DELETE FROM test_runs")
    conn.execute("DELETE FROM test_group_cases")
    conn.execute("DELETE FROM test_groups")
    conn.execute("DELETE FROM test_cases")
    # reset sequences for test tables only
    for tbl in ("test_cases", "test_groups", "test_runs", "test_results"):
        conn.execute("DELETE FROM sqlite_sequence WHERE name=?", (tbl,))
    conn.commit()

    # ── insert one test case per leaf ─────────────────────────────────
    created = 0
    level_counts = {}

    for item in sorted(leaves, key=lambda x: (x["dropdown_num"], x["item_id"])):
        pid = path_ids(item["item_id"])
        label = path_label(item["item_id"])
        lv = item["dropdown_num"]

        conn.execute(
            """INSERT INTO test_cases
               (d1_id, d2_id, d3_id, d4_id, d5_id, d6_id, d7_id, task, notes)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                pid.get(1), pid.get(2), pid.get(3),
                pid.get(4), pid.get(5), pid.get(6), pid.get(7),
                f"Test: {label}",
                "",
            ),
        )
        created += 1
        level_counts[lv] = level_counts.get(lv, 0) + 1

    conn.commit()
    conn.close()

    print(f"\n✓ Created {created} test cases:")
    for lv in sorted(level_counts):
        print(f"  Deepest level {lv}: {level_counts[lv]} cases")


if __name__ == "__main__":
    seed()
