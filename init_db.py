import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "uat_tracker.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS dropdown_items (
            item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            dropdown_num INTEGER NOT NULL,
            value TEXT NOT NULL,
            parent_item_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS test_cases (
            case_id INTEGER PRIMARY KEY AUTOINCREMENT,
            d1_id INTEGER,
            d2_id INTEGER,
            d3_id INTEGER,
            d4_id INTEGER,
            d5_id INTEGER,
            d6_id INTEGER,
            d7_id INTEGER,
            task TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS test_groups (
            group_id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS test_group_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL REFERENCES test_groups(group_id) ON DELETE CASCADE,
            case_id INTEGER NOT NULL REFERENCES test_cases(case_id) ON DELETE CASCADE,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS test_runs (
            run_id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER REFERENCES test_groups(group_id),
            run_name TEXT,
            run_date TEXT DEFAULT (datetime('now')),
            notes TEXT,
            status TEXT DEFAULT 'in_progress'
        );

        CREATE TABLE IF NOT EXISTS test_results (
            result_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL REFERENCES test_runs(run_id) ON DELETE CASCADE,
            case_id INTEGER NOT NULL REFERENCES test_cases(case_id),
            result TEXT DEFAULT 'pending',
            result_notes TEXT,
            completed_at TEXT
        );
    """)

    # Only seed if dropdown_items is empty
    count = c.execute("SELECT COUNT(*) FROM dropdown_items").fetchone()[0]
    if count == 0:
        _seed_dropdowns(c)

    conn.commit()
    conn.close()


def _seed_dropdowns(c):
    # ------------------------------------------------------------------ #
    # Helper
    # ------------------------------------------------------------------ #
    def insert(dropdown_num, value, parent_item_id=None, sort_order=0):
        c.execute(
            "INSERT INTO dropdown_items (dropdown_num, value, parent_item_id, sort_order) VALUES (?,?,?,?)",
            (dropdown_num, value, parent_item_id, sort_order),
        )
        return c.lastrowid

    # ------------------------------------------------------------------ #
    # Dropdown 1 — Application (no parent)
    # ------------------------------------------------------------------ #
    insert(1, "Mac", None, 0)
    insert(1, "Windows", None, 1)
    insert(1, "Codebase", None, 2)

    # ------------------------------------------------------------------ #
    # Dropdown 2 — Testing Group (no parent, independent)
    # ------------------------------------------------------------------ #
    insert(2, "General", None, 0)
    insert(2, "Menu Item", None, 1)
    insert(2, "Special", None, 2)

    # ------------------------------------------------------------------ #
    # Dropdown 3 — Menu Item (no parent, independent)
    # ------------------------------------------------------------------ #
    d3_dashboard     = insert(3, "Dashboard",      None, 0)
    d3_expense       = insert(3, "Expense",         None, 1)
    d3_revenue       = insert(3, "Revenue",         None, 2)
    d3_reports       = insert(3, "Reports",         None, 3)
    d3_clients       = insert(3, "Clients",         None, 4)
    d3_admin         = insert(3, "Admin Actions",   None, 5)
    d3_help          = insert(3, "Help",            None, 6)

    # ------------------------------------------------------------------ #
    # Dropdown 4 — Section (parent = dropdown-3 item)
    # ------------------------------------------------------------------ #
    insert(4, "Graph", d3_dashboard, 0)

    d4_ocr      = insert(4, "OCR Processing Tab",  d3_expense, 0)
    d4_review   = insert(4, "Receipt Review Tab",  d3_expense, 1)
    d4_manual   = insert(4, "Manual Expense Tab",  d3_expense, 2)
    d4_exp_se   = insert(4, "Search/Edit Tab",      d3_expense, 3)
    insert(4, "Add Return Tab",                    d3_expense, 4)

    d4_rev_add  = insert(4, "Add Revenue Tab",     d3_revenue, 0)
    insert(4, "Search/Edit Tab",                   d3_revenue, 1)

    d4_clients_list = insert(4, "Client List",     d3_clients, 0)
    insert(4, "Add Client",                        d3_clients, 1)

    insert(4, "Expense Categories",  d3_admin, 0)
    insert(4, "Payment Methods",     d3_admin, 1)
    insert(4, "Products",            d3_admin, 2)
    insert(4, "Projects",            d3_admin, 3)
    insert(4, "Revenue Categories",  d3_admin, 4)
    insert(4, "Vendors",             d3_admin, 5)
    insert(4, "Backup & Restore",    d3_admin, 6)
    insert(4, "Activation",          d3_admin, 7)

    # ------------------------------------------------------------------ #
    # Dropdown 5 — Field/Button (parent = dropdown-4 item)
    # ------------------------------------------------------------------ #
    d5_upload_btn   = insert(5, "Upload Button",            d4_ocr,    0)
    insert(5, "Scan Folder Button",                         d4_ocr,    1)
    d5_ocr_section  = insert(5, "OCR Processing Section",   d4_ocr,    2)

    insert(5, "Select Receipt Dropdown",                    d4_review, 0)
    d5_header_fields = insert(5, "Header Fields",           d4_review, 1)
    insert(5, "Line Item Splits",                           d4_review, 2)
    insert(5, "Save/Process Button",                        d4_review, 3)

    d5_rev_form = insert(5, "Revenue Form",                 d4_rev_add, 0)

    d5_client_search = insert(5, "Search Filter",           d4_clients_list, 0)
    insert(5, "Add Client Button",                          d4_clients_list, 1)

    # Child fields of Header Fields (still dropdown 5, parent = d5_header_fields)
    d5_vendor_field   = insert(5, "Vendor Field",           d5_header_fields, 0)
    insert(5, "Receipt Date Field",                         d5_header_fields, 1)
    insert(5, "Payment Method Field",                       d5_header_fields, 2)
    insert(5, "Total Amount Field",                         d5_header_fields, 3)
    insert(5, "Sales Tax Field",                            d5_header_fields, 4)

    # ------------------------------------------------------------------ #
    # Dropdown 6 — Function 1 (parent = dropdown-5 item)
    # ------------------------------------------------------------------ #
    d6_change_folder   = insert(6, "Change Folder Function",  d5_upload_btn,   0)
    d6_upload_files    = insert(6, "Upload Files Function",   d5_upload_btn,   1)
    d6_progress_bar    = insert(6, "Progress Bar",            d5_ocr_section,  0)
    d6_status_display  = insert(6, "Status Display",          d5_ocr_section,  1)
    d6_vendor_match    = insert(6, "Vendor Matching",         d5_vendor_field, 0)
    d6_new_vendor_warn = insert(6, "New Vendor Warning",      d5_vendor_field, 1)

    # ------------------------------------------------------------------ #
    # Dropdown 7 — Function 2 (parent = dropdown-6 item) — minimal seeds
    # ------------------------------------------------------------------ #
    insert(7, "Folder Dialog Opens",    d6_change_folder,   0)
    insert(7, "Progress Increments",    d6_progress_bar,    0)
    insert(7, "Match Highlights",       d6_vendor_match,    0)


if __name__ == "__main__":
    init_db()
    print("Database initialised successfully.")
