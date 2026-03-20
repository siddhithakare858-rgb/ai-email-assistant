import sqlite3
from datetime import datetime, timezone

from app.db.database import connect


def _utc_now_iso() -> str:
    # SQLite stores timestamps as ISO strings in this MVP.
    return datetime.now(timezone.utc).isoformat()


def upsert_participant_and_store_availability(
    db_path: str,
    participant_email: str,
    intervals: list[tuple],
    source_message_id: str,
) -> int:
    """
    Create participant row if needed and insert availability windows.
    Returns participant_id.
    """
    with connect(db_path) as conn:
        # Upsert participant (SQLite has ON CONFLICT, but this works even on older builds).
        cur = conn.execute("SELECT id FROM participants WHERE email = ?", (participant_email,))
        row = cur.fetchone()
        if row:
            participant_id = int(row["id"])
        else:
            cur = conn.execute(
                "INSERT INTO participants(email, created_at) VALUES(?, ?)",
                (participant_email, _utc_now_iso()),
            )
            participant_id = int(cur.lastrowid)

        for start_ist, end_ist in intervals:
            conn.execute(
                """
                INSERT INTO availabilities(participant_id, start_ist, end_ist, source_message_id, created_at)
                VALUES(?, ?, ?, ?, ?)
                """,
                (participant_id, start_ist.isoformat(), end_ist.isoformat(), source_message_id, _utc_now_iso()),
            )

        return participant_id


def get_participant_emails(db_path: str) -> list[str]:
    with connect(db_path) as conn:
        cur = conn.execute("SELECT email FROM participants ORDER BY created_at DESC")
        return [r["email"] for r in cur.fetchall()]


def get_availabilities_for_participants(db_path: str, participant_emails: list[str]) -> list[list[tuple]]:
    """
    Returns a list where each element corresponds to one participant's availability windows:
    [
      [(start_dt, end_dt), (start_dt, end_dt)],
      [(start_dt, end_dt)],
    ]
    """
    with connect(db_path) as conn:
        result: list[list[tuple]] = []
        for email in participant_emails:
            cur = conn.execute(
                """
                SELECT a.start_ist, a.end_ist
                FROM availabilities a
                JOIN participants p ON p.id = a.participant_id
                WHERE p.email = ?
                ORDER BY a.created_at ASC
                """,
                (email,),
            )
            rows = cur.fetchall()
            # Let datetime parsing happen in caller if needed; we store ISO strings, but
            # overlap finder expects datetime objects, so we convert here.
            windows = []
            for r in rows:
                start_dt = datetime.fromisoformat(r["start_ist"])
                end_dt = datetime.fromisoformat(r["end_ist"])
                windows.append((start_dt, end_dt))
            result.append(windows)
        return result

