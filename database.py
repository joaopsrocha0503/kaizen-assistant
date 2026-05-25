import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "kaizen.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            area TEXT NOT NULL,
            responsible TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'cancelled')),
            analysis_5w1h TEXT,
            a3_report TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            problem_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            responsible TEXT NOT NULL,
            deadline TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'overdue')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
        );
    """)

    conn.commit()
    conn.close()


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def now():
    return datetime.utcnow().isoformat()


# --- Problems ---

def create_problem(data):
    conn = get_connection()
    ts = now()
    cursor = conn.execute(
        """INSERT INTO problems (title, description, area, responsible, priority, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?)""",
        (data["title"], data["description"], data["area"], data["responsible"], data["priority"], ts, ts)
    )
    problem_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_problem(problem_id)


def get_problem(problem_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM problems WHERE id = ?", (problem_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def list_problems(status=None, area=None, priority=None):
    conn = get_connection()
    query = "SELECT * FROM problems WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if area:
        query += " AND area = ?"
        params.append(area)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def update_problem(problem_id, data):
    conn = get_connection()
    allowed = ["title", "description", "area", "responsible", "priority", "status", "analysis_5w1h", "a3_report"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn.close()
        return get_problem(problem_id)
    fields["updated_at"] = now()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [problem_id]
    conn.execute(f"UPDATE problems SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return get_problem(problem_id)


def delete_problem(problem_id):
    conn = get_connection()
    conn.execute("DELETE FROM problems WHERE id = ?", (problem_id,))
    conn.commit()
    conn.close()


# --- Actions ---

def create_action(data):
    conn = get_connection()
    ts = now()
    cursor = conn.execute(
        """INSERT INTO actions (problem_id, title, description, responsible, deadline, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)""",
        (data["problem_id"], data["title"], data.get("description", ""), data["responsible"], data["deadline"], ts, ts)
    )
    action_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_action(action_id)


def get_action(action_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def list_actions(problem_id=None, status=None):
    conn = get_connection()
    query = "SELECT * FROM actions WHERE 1=1"
    params = []
    if problem_id:
        query += " AND problem_id = ?"
        params.append(problem_id)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY deadline ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def update_action(action_id, data):
    conn = get_connection()
    allowed = ["title", "description", "responsible", "deadline", "status"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        conn.close()
        return get_action(action_id)
    fields["updated_at"] = now()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [action_id]
    conn.execute(f"UPDATE actions SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return get_action(action_id)


def delete_action(action_id):
    conn = get_connection()
    conn.execute("DELETE FROM actions WHERE id = ?", (action_id,))
    conn.commit()
    conn.close()


# --- KPIs ---

def get_kpis():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM problems").fetchone()[0]
    open_p = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'open'").fetchone()[0]
    in_progress = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'in_progress'").fetchone()[0]
    completed = conn.execute("SELECT COUNT(*) FROM problems WHERE status = 'completed'").fetchone()[0]
    total_actions = conn.execute("SELECT COUNT(*) FROM actions").fetchone()[0]
    completed_actions = conn.execute("SELECT COUNT(*) FROM actions WHERE status = 'completed'").fetchone()[0]
    overdue_actions = conn.execute(
        "SELECT COUNT(*) FROM actions WHERE status != 'completed' AND deadline < ?",
        (datetime.utcnow().date().isoformat(),)
    ).fetchone()[0]

    by_priority = {}
    for row in conn.execute("SELECT priority, COUNT(*) as cnt FROM problems GROUP BY priority").fetchall():
        by_priority[row["priority"]] = row["cnt"]

    by_area = {}
    for row in conn.execute("SELECT area, COUNT(*) as cnt FROM problems GROUP BY area ORDER BY cnt DESC LIMIT 5").fetchall():
        by_area[row["area"]] = row["cnt"]

    conn.close()
    completion_rate = round((completed / total * 100), 1) if total > 0 else 0
    action_completion_rate = round((completed_actions / total_actions * 100), 1) if total_actions > 0 else 0

    return {
        "total_problems": total,
        "open_problems": open_p,
        "in_progress_problems": in_progress,
        "completed_problems": completed,
        "completion_rate": completion_rate,
        "total_actions": total_actions,
        "completed_actions": completed_actions,
        "overdue_actions": overdue_actions,
        "action_completion_rate": action_completion_rate,
        "by_priority": by_priority,
        "by_area": by_area,
    }
