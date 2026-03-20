import sqlite3
from contextlib import contextmanager


def get_connection(db_path: str) -> sqlite3.Connection:
    # check_same_thread=False lets FastAPI reuse connection in a simple MVP style.
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: str) -> None:
    conn = get_connection(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS availabilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                participant_id INTEGER NOT NULL,
                start_ist TEXT NOT NULL,
                end_ist TEXT NOT NULL,
                source_message_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_availabilities_participant_id ON availabilities(participant_id);

            -- Background polling: track which emails have been processed.
            CREATE TABLE IF NOT EXISTS processed_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL UNIQUE,
                subject TEXT,
                processed_at TEXT NOT NULL,
                action_taken TEXT,
                status TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_processed_emails_processed_at ON processed_emails(processed_at);

            -- Processing logs for /logs endpoint.
            CREATE TABLE IF NOT EXISTS processing_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TEXT NOT NULL,
                message_id TEXT,
                subject TEXT,
                action_taken TEXT,
                status TEXT,
                details TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_processing_logs_logged_at ON processing_logs(logged_at);
            """
        )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def connect(db_path: str):
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

