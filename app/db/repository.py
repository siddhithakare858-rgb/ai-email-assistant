import sqlite3
from datetime import datetime, timezone
from typing import Optional

from app.db.database import connect
from app.tz import IST_TZ


def _utc_now_iso() -> str:
    # SQLite stores timestamps as ISO strings in this MVP.
    return datetime.now(timezone.utc).isoformat()


def is_message_processed(db_path: str, message_id: str) -> bool:
    with connect(db_path) as conn:
        cur = conn.execute("SELECT 1 FROM processed_emails WHERE message_id = ? LIMIT 1", (message_id,))
        return cur.fetchone() is not None


def record_processed_email(
    db_path: str,
    *,
    message_id: str,
    subject: str,
    action_taken: str,
    status: str,
    processed_at: datetime,
) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO processed_emails(message_id, subject, processed_at, action_taken, status)
            VALUES(?, ?, ?, ?, ?)
            """,
            (message_id, subject, processed_at.isoformat(), action_taken, status),
        )


def add_processing_log(
    db_path: str,
    *,
    logged_at: datetime,
    message_id: Optional[str],
    subject: Optional[str],
    action_taken: Optional[str],
    status: Optional[str],
    details: Optional[str],
) -> None:
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO processing_logs(logged_at, message_id, subject, action_taken, status, details)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                logged_at.isoformat(),
                message_id,
                subject,
                action_taken,
                status,
                details,
            ),
        )


def get_last_processing_logs(db_path: str, limit: int = 20) -> list[dict]:
    with connect(db_path) as conn:
        cur = conn.execute(
            """
            SELECT logged_at, message_id, subject, action_taken, status, details
            FROM processing_logs
            ORDER BY logged_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(r) for r in cur.fetchall()]


def count_processed_today(db_path: str, *, tz=IST_TZ) -> int:
    today_str = datetime.now(tz).date().isoformat()
    # processed_at is stored in local tz isoformat, so the date prefix matches "local date".
    with connect(db_path) as conn:
        cur = conn.execute(
            """
            SELECT COUNT(1) as cnt
            FROM processed_emails
            WHERE substr(processed_at, 1, 10) = ?
            """,
            (today_str,),
        )
        row = cur.fetchone()
        return int(row["cnt"]) if row else 0


def get_last_email_subject(db_path: str) -> Optional[str]:
    with connect(db_path) as conn:
        cur = conn.execute(
            """
            SELECT subject
            FROM processed_emails
            ORDER BY processed_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        return row["subject"] if row and row["subject"] else None


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

