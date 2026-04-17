"""
set_sort_orders.py
Sets sort_order values on dropdown items so the run list follows
the natural application testing flow.

Run from the uat_tracker project root:
  .venv/bin/python3 set_sort_orders.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "uat_tracker.db"

# ── Desired order by level ────────────────────────────────────────────
# Key: lowercase value name (or (parent_lower, value_lower) for disambiguation)
# Value: sort position (lower = first)

LEVEL3 = {
    "bokkeeping_ocr":  0,
    "bookkeeping_ocr": 0,
    "dashboard":       1,
    "expense":         2,
    "revenue":         3,
    "reports":         4,
    "clients":         5,
    "admin actions":   6,
    "help":            7,
}

# Level 4 sections — keyed by (parent_function_group_lower, section_lower)
LEVEL4 = {
    # Dashboard
    ("dashboard",      "graph"):                0,
    ("dashboard",      "revenue pie chart"):    1,
    ("dashboard",      "expense pie chart"):    2,
    # Expense
    ("expense",        "ocr processing tab"):   0,
    ("expense",        "receipt review tab"):   1,
    ("expense",        "manual expense tab"):   2,
    ("expense",        "search/edit tab"):      3,
    ("expense",        "add return"):           4,
    # Revenue
    ("revenue",        "add revenue"):          0,
    ("revenue",        "search/edit tab"):      1,
    ("revenue",        "refund"):               2,
    # Reports
    ("reports",        "print reports"):        0,
    ("reports",        "download reports"):     1,
    # Clients
    ("clients",        "add client"):           0,
    ("clients",        "filter clients"):       1,
    ("clients",        "line items"):           2,
    # Admin actions
    ("admin actions",  "expense categories"):   0,
    ("admin actions",  "payment methods"):      1,
    ("admin actions",  "products"):             2,
    ("admin actions",  "projects"):             3,
    ("admin actions",  "revenue categories"):   4,
    ("admin actions",  "vendors"):              5,
    ("admin actions",  "back & restore"):       6,
    ("admin actions",  "backup & restore"):     6,
    ("admin actions",  "activation"):           7,
}

# Level 5 fields — keyed by (parent_section_lower, field_lower)
LEVEL5 = {
    # OCR Processing Tab
    ("ocr processing tab",         "ocr processing"):            0,
    ("ocr processing tab",         "receipt image maintenance"): 1,
    # Receipt Review Tab
    ("receipt review tab",         "select receipt"):            0,
    ("receipt review tab",         "image"):                     1,
    ("receipt review tab",         "header fields"):             2,
    ("receipt review tab",         "line item splits"):          3,
    ("receipt review tab",         "required field indicator"):  4,
    ("receipt review tab",         "save"):                      5,
    # Manual Expense Tab
    ("manual expense tab",         "header fields"):             0,
    ("manual expense tab",         "line item splits"):          1,
    ("manual expense tab",         "required field indicator"):  2,
    ("manual expense tab",         "save"):                      3,
    # Search/edit Tab (expense)
    ("search/edit tab",            "saved filters"):             0,
    ("search/edit tab",            "filter receipts"):           1,
    ("search/edit tab",            "filter revenue"):            1,
    ("search/edit tab",            "line items"):                2,
    ("search/edit tab",            "line item splits"):          3,
    ("search/edit tab",            "edit receipts"):             4,
    ("search/edit tab",            "edit "):                     4,
    # Add return
    ("add return",                 "header fields"):             0,
    ("add return",                 "line item splits"):          1,
    ("add return",                 "required field indicator"):  2,
    ("add return",                 "save"):                      3,
    # Add Revenue
    ("add revenue",                "header fields"):             0,
    ("add revenue",                "line item splits"):          1,
    ("add revenue",                "required field indicator"):  2,
    ("add revenue",                "save"):                      3,
    # Graph (Dashboard)
    ("graph",                      "year"):                      0,
    ("graph",                      "month"):                     1,
    ("graph",                      "graph diagram"):             2,
    ("graph",                      "drop down"):                 3,
}

# Level 6 Function 1 — keyed by (parent_field_lower, func1_lower)
LEVEL6 = {
    # OCR Processing
    ("ocr processing",             "upload"):                    0,
    ("ocr processing",             "run ocr"):                   1,
    ("ocr processing",             "indicators"):                2,
    # Receipt Image Maintenance
    ("receipt image maintenance",  "image"):                     0,
    ("receipt image maintenance",  "preview"):                   1,
    ("receipt image maintenance",  "delete"):                    2,
    # Select Receipt
    ("select receipt",             "dropdown"):                  0,
    # Saved filters
    ("saved filters",              "save filter"):               0,
    ("saved filters",              "delete filter"):             1,
    ("saved filters",              "generate excel"):            2,
    ("saved filters",              "print report"):              3,
    # Filter receipts
    ("filter receipts",            "vendor"):                    0,
    ("filter receipts",            "category"):                  1,
    ("filter receipts",            "project"):                   2,
    ("filter receipts",            "payment method"):            3,
    ("filter receipts",            "source"):                    4,
    ("filter receipts",            "date from"):                 5,
    ("filter receipts",            "date to"):                   6,
    ("filter receipts",            "amount min"):                7,
    ("filter receipts",            "amount max"):                8,
    ("filter receipts",            "search notes"):              9,
}


def apply():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    items = {
        r["item_id"]: dict(r)
        for r in conn.execute("SELECT * FROM dropdown_items")
    }

    def parent_val(item):
        pid = item.get("parent_item_id")
        if not pid:
            return ""
        p = items.get(pid)
        return p["value"].strip().lower() if p else ""

    updates = []

    for item in items.values():
        lv  = item["dropdown_num"]
        val = item["value"].strip().lower()
        pv  = parent_val(item)

        order = None

        if lv == 3:
            order = LEVEL3.get(val)
        elif lv == 4:
            order = LEVEL4.get((pv, val))
        elif lv == 5:
            order = LEVEL5.get((pv, val))
        elif lv == 6:
            order = LEVEL6.get((pv, val))

        if order is not None and order != item["sort_order"]:
            updates.append((order, item["item_id"]))

    conn.executemany(
        "UPDATE dropdown_items SET sort_order=? WHERE item_id=?", updates
    )
    conn.commit()
    conn.close()
    print(f"✓ Updated sort_order on {len(updates)} items.")


if __name__ == "__main__":
    apply()
