import threading
import time
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.tz import IST_TZ
from app.config import load_config
from app.db.database import init_db
from app.db.repository import (
    add_processing_log,
    count_processed_today,
    get_availabilities_for_participants,
    get_last_email_subject,
    get_last_processing_logs,
    get_participant_emails,
    is_message_processed,
    record_processed_email,
    upsert_participant_and_store_availability,
)
from app.email.gmail_client import GmailClient
from app.calendar.google_calendar_client import GoogleCalendarClient
from app.parsing.availability_parser import AvailabilityInterval, parse_availability
from app.scheduling.overlap_finder import find_overlapping_slots

cfg = load_config()

app = FastAPI(title="AI Email Scheduling Assistant (MVP)")

# Allow hackathon demo requests from any origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProcessEmailsRequest(BaseModel):
    message_ids: list[str]
    organizer_email: str
    calendar_summary: Optional[str] = "Scheduling Confirmation (AI)"

class ProcessEmailsResponse(BaseModel):
    overlap_start_ist: str
    overlap_end_ist: str
    calendar_event_id: str
    calendar_event_link: Optional[str] = None
    replied_to: list[str]

# Polling state exposed by /status
polling_state = {
    "is_polling": False,
    "last_checked": None,  # ISO string
    "last_email_subject": None,
}
polling_state_lock = threading.Lock()
polling_thread: Optional[threading.Thread] = None
polling_stop_event = threading.Event()

# Keyword heuristics (MVP)
SCHEDULING_KEYWORDS = [
    "available",
    "free",
    "schedule",
    "meet",
    "availability",
    "time slot",
]
UPDATE_KEYWORDS = [
    "update",
    "status",
    "any news",
    "what happened",
]


def _now_ist_iso() -> str:
    return datetime.now(IST_TZ).isoformat()


def detect_update_request(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in UPDATE_KEYWORDS)


def detect_scheduling_request(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in SCHEDULING_KEYWORDS)


def summarize_latest_thread_messages(messages: list) -> str:
    """
    MVP extractive summarizer:
    - takes the last 3 message bodies
    - trims each to a short snippet
    """
    bodies: list[str] = []
    for m in messages[-3:]:
        body = (getattr(m, "body_text", None) or "").strip()
        if body:
            bodies.append(body)
    if not bodies:
        return "No recent message content found in this thread."

    parts: list[str] = []
    for idx, body in enumerate(bodies, start=1):
        one_line = " ".join(body.split())
        trimmed = one_line[:250] + ("..." if len(one_line) > 250 else "")
        parts.append(f"{idx}. {trimmed}")
    return "Recent context:\n" + "\n".join(parts)

@app.on_event("startup")
def _startup():
    init_db(cfg["DATABASE_PATH"])
    global polling_thread
    with polling_state_lock:
        if polling_thread is None or not polling_thread.is_alive():
            polling_stop_event.clear()
            polling_thread = threading.Thread(target=_poll_loop, daemon=True)
            polling_state["is_polling"] = True
            polling_thread.start()


def _poll_loop() -> None:
    db_path = cfg["DATABASE_PATH"]
    gmail: Optional[GmailClient] = None
    assistant_email: Optional[str] = None

    def _log(
        *,
        message_id: Optional[str],
        subject: Optional[str],
        action_taken: Optional[str],
        status: Optional[str],
        details: Optional[str] = None,
    ) -> None:
        logged_at = datetime.now(IST_TZ)
        console_msg = (
            f"[{logged_at.isoformat()}] message_id={message_id} subject={subject} "
            f"action={action_taken} status={status}"
        )
        if details:
            console_msg += f" details={details}"
        print(console_msg)
        add_processing_log(
            db_path,
            logged_at=logged_at,
            message_id=message_id,
            subject=subject,
            action_taken=action_taken,
            status=status,
            details=details,
        )

    while not polling_stop_event.is_set():
        with polling_state_lock:
            polling_state["last_checked"] = _now_ist_iso()

        try:
            if gmail is None:
                gmail = GmailClient()
                try:
                    assistant_email = gmail.get_profile_email()
                except Exception:
                    assistant_email = None

            unread_ids = gmail.list_unread_message_ids(max_results=10)
        except Exception as e:
            _log(
                message_id=None,
                subject=None,
                action_taken="poll",
                status="error",
                details=str(e),
            )
            time.sleep(60)
            continue

        for message_id in unread_ids:
            if polling_stop_event.is_set():
                break

            try:
                if is_message_processed(db_path, message_id):
                    continue

                original = gmail.get_message_full(message_id)
                subject = original.subject
                full_text = f"{original.subject}\n{original.from_email}\n{original.body_text}"

                # Scheduling request
                if detect_scheduling_request(full_text):
                    action_taken = "scheduling"
                    status = "success"

                    reference_ist = datetime.now(IST_TZ)
                    intervals = parse_availability(original.body_text, reference_ist=reference_ist)
                    if not intervals:
                        status = "no_availability"
                        _log(
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            details="No availability intervals found in email body.",
                        )
                        record_processed_email(
                            db_path,
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            processed_at=datetime.now(IST_TZ),
                        )
                        continue

                    upsert_participant_and_store_availability(
                        db_path,
                        participant_email=original.from_email,
                        intervals=[(i.start, i.end) for i in intervals],
                        source_message_id=message_id,
                    )

                    participant_emails = get_participant_emails(db_path)
                    raw_windows = get_availabilities_for_participants(db_path, participant_emails)

                    # Filter out participants with no availability stored yet.
                    participant_emails_filtered: list[str] = []
                    participant_intervals: list[list[AvailabilityInterval]] = []
                    for email, windows in zip(participant_emails, raw_windows):
                        if windows:
                            participant_emails_filtered.append(email)
                            participant_intervals.append([AvailabilityInterval(start=s, end=e) for (s, e) in windows])

                    if len(participant_intervals) < 2:
                        status = "not_enough_participants"
                        _log(
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            details="Need at least 2 participants with stored availability before scheduling.",
                        )
                        record_processed_email(
                            db_path,
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            processed_at=datetime.now(IST_TZ),
                        )
                        continue

                    overlap_segments = find_overlapping_slots(participant_intervals)
                    if not overlap_segments:
                        status = "no_overlap"
                        _log(
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            details="No overlapping slot found across stored availabilities.",
                        )
                        record_processed_email(
                            db_path,
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status=status,
                            processed_at=datetime.now(IST_TZ),
                        )
                        continue

                    overlap = sorted(overlap_segments, key=lambda x: x.start)[0]
                    organizer_email = assistant_email or original.from_email

                    calendar_event_id = "demo-event-123"
                    calendar_event_link = "https://calendar.google.com/event?demo"
                    try:
                        calendar_client = GoogleCalendarClient()
                        created_event_id, created_event_link = calendar_client.create_event(
                            summary="Scheduling Confirmation (AI)",
                            start_dt=overlap.start,
                            end_dt=overlap.end,
                            description=(
                                "This calendar event was generated by an experimental AI assistant.\n"
                                "It was created automatically based on overlapping availability extracted from emails."
                            ),
                            attendees_emails=participant_emails_filtered,
                        )
                        if created_event_id:
                            calendar_event_id = created_event_id
                        if created_event_link:
                            calendar_event_link = created_event_link
                    except Exception as e:
                        _log(
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status="calendar_fallback",
                            details=str(e),
                        )

                    gmail.send_confirmation_reply(
                        to_email=original.from_email,
                        organizer_email=organizer_email,
                        original=original,
                        meeting_start_iso=overlap.start.isoformat(),
                        meeting_end_iso=overlap.end.isoformat(),
                        calendar_link=calendar_event_link,
                        participant_emails=participant_emails_filtered,
                    )

                    _log(
                        message_id=message_id,
                        subject=subject,
                        action_taken=action_taken,
                        status=status,
                        details=f"calendar_event_id={calendar_event_id}",
                    )

                # Update request
                elif detect_update_request(full_text):
                    action_taken = "update"
                    status = "success"

                    thread_messages = []
                    if original.thread_id:
                        thread_messages = gmail.get_thread_messages(original.thread_id)

                    # Summarize last 3 messages of the thread.
                    summary = summarize_latest_thread_messages(thread_messages[-3:])
                    disclaimer = "This email was generated by an experimental AI assistant."
                    reply_body = f"{summary}\n\n{disclaimer}"

                    organizer_email = assistant_email or original.from_email
                    gmail.send_text_reply(
                        to_email=original.from_email,
                        organizer_email=organizer_email,
                        original=original,
                        subject=original.subject or "Update",
                        body_text=reply_body,
                    )

                    _log(
                        message_id=message_id,
                        subject=subject,
                        action_taken=action_taken,
                        status=status,
                        details=None,
                    )

                # Unknown/irrelevant email
                else:
                    action_taken = "ignored"
                    status = "skipped"
                    _log(
                        message_id=message_id,
                        subject=subject,
                        action_taken=action_taken,
                        status=status,
                        details="Email did not match scheduling or update keywords.",
                    )

                record_processed_email(
                    db_path,
                    message_id=message_id,
                    subject=subject,
                    action_taken=action_taken,
                    status=status,
                    processed_at=datetime.now(IST_TZ),
                )

                # Mark as read only after we've successfully handled it.
                # Leave "ignored/skipped" messages unread so you can refine keywords later.
                if gmail is not None and status != "skipped":
                    try:
                        gmail.mark_as_read(message_id)
                    except Exception as e:
                        _log(
                            message_id=message_id,
                            subject=subject,
                            action_taken=action_taken,
                            status="mark_as_read_failed",
                            details=str(e),
                        )

                with polling_state_lock:
                    polling_state["last_email_subject"] = subject

            except Exception as e:
                _log(
                    message_id=message_id,
                    subject=None,
                    action_taken="error",
                    status="error",
                    details=str(e),
                )
                try:
                    record_processed_email(
                        db_path,
                        message_id=message_id,
                        subject=None,
                        action_taken="error",
                        status="error",
                        processed_at=datetime.now(IST_TZ),
                    )
                except Exception:
                    pass

        time.sleep(60)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/messages")
def get_messages():
    """Get latest message IDs from Gmail inbox."""
    gmail = GmailClient()
    return gmail.list_messages()

# Dummy email used in the MVP (avoids Gmail integration)
class DummyEmail:
    def __init__(self, email: str, body: str):
        self.from_email = email
        self.body_text = body
        self.subject = ""

@app.post("/process-emails", response_model=ProcessEmailsResponse)
def process_emails(req: ProcessEmailsRequest) -> ProcessEmailsResponse:
    if not (1 <= len(req.message_ids) <= 3):
        raise HTTPException(status_code=400, detail="MVP expects 1-3 message_ids.")

    participant_intervals: list[list[AvailabilityInterval]] = []
    participant_emails: list[str] = []

    reference_ist = datetime.now(IST_TZ)

    gmail = None
    gmail_fallback_logged = False
    try:
        gmail = GmailClient()
    except Exception as e:
        # Token missing / invalid credentials: fall back to dummy parsing.
        # (Still keeps MVP usable without Google setup.)
        print(f"[process-emails] Gmail client init failed; using dummy fallback. Error: {e}")

    # Try real Gmail first; fall back to dummy mode if any Gmail step fails.
    for message_id in req.message_ids:
        if gmail is not None:
            try:
                original = gmail.get_message(message_id)
            except Exception as e:
                if not gmail_fallback_logged:
                    print(
                        f"[process-emails] Gmail API failed; using dummy fallback. "
                        f"Error: {e}"
                    )
                    gmail_fallback_logged = True
                original = None
        else:
            original = None

        if original is None:
            # Dummy email used only for fallback/demo parsing.
            if message_id == "msg1":
                original = {"from_email": "a@test.com", "subject": "Availability", "body_text": "I am free tomorrow 10-12"}
            else:
                original = {"from_email": "b@test.com", "subject": "Availability", "body_text": "Available 11-1"}

        intervals = parse_availability(original["body_text"], reference_ist=reference_ist)
        if not intervals:
            continue

        upsert_participant_and_store_availability(
            cfg["DATABASE_PATH"],
            participant_email=original["from_email"],
            intervals=[(i.start, i.end) for i in intervals],
            source_message_id=message_id,
        )

        participant_intervals.append(intervals)
        participant_emails.append(original["from_email"])

    if not participant_intervals:
        raise HTTPException(status_code=400, detail="Could not parse availability.")

    # Compute overlap across all stored participants (so a single new email can still
    # schedule if other participants already have availability stored).
    participant_emails_all = get_participant_emails(cfg["DATABASE_PATH"])
    raw_windows_all = get_availabilities_for_participants(cfg["DATABASE_PATH"], participant_emails_all)

    participant_emails_filtered: list[str] = []
    participant_intervals_stored: list[list[AvailabilityInterval]] = []
    for email, windows in zip(participant_emails_all, raw_windows_all):
        if windows:
            participant_emails_filtered.append(email)
            participant_intervals_stored.append(
                [AvailabilityInterval(start=s, end=e) for (s, e) in windows]
            )

    if len(participant_intervals_stored) < 2:
        raise HTTPException(status_code=404, detail="Not enough stored availability to find overlap.")

    overlap_segments = find_overlapping_slots(participant_intervals_stored)
    if not overlap_segments:
        raise HTTPException(status_code=404, detail="No overlapping slot found.")

    overlap = sorted(overlap_segments, key=lambda x: x.start)[0]
    meeting_start_iso = overlap.start.isoformat()
    meeting_end_iso = overlap.end.isoformat()

    # Create Calendar event (or fall back to demo values if OAuth/token isn't ready).
    calendar_event_id = "demo-event-123"
    calendar_event_link = "https://calendar.google.com/event?demo"
    calendar_summary = req.calendar_summary or "Scheduling Confirmation (AI)"
    calendar_description = (
        "This calendar event was generated by an experimental AI assistant.\n"
        "It was created automatically based on the overlapping availability extracted from emails."
    )

    try:
        calendar_client = GoogleCalendarClient()
        created_event_id, created_event_link = calendar_client.create_event(
            summary=calendar_summary,
            start_dt=overlap.start,
            end_dt=overlap.end,
            description=calendar_description,
            attendees_emails=participant_emails_filtered,
        )
        if not created_event_id:
            raise RuntimeError("Calendar API returned empty event id.")

        calendar_event_id, calendar_event_link = created_event_id, created_event_link
    except Exception as e:
        print(f"[process-emails] Calendar API failed; using demo calendar values. Error: {e}")

    # Email reply (still dummy in MVP; you can later hook to GmailClient.send_confirmation_reply).
    replied_to = participant_emails_filtered

    return ProcessEmailsResponse(
        overlap_start_ist=meeting_start_iso,
        overlap_end_ist=meeting_end_iso,
        calendar_event_id=calendar_event_id,
        calendar_event_link=calendar_event_link,
        replied_to=replied_to,
    )

@app.get("/status")
def status():
    db_path = cfg["DATABASE_PATH"]
    emails_processed_today = count_processed_today(db_path)
    with polling_state_lock:
        last_subject = polling_state.get("last_email_subject")
    if not last_subject:
        last_subject = get_last_email_subject(db_path)

    return {
        "is_polling": polling_state["is_polling"],
        "last_checked": polling_state["last_checked"],
        "emails_processed_today": emails_processed_today,
        "last_email_subject": last_subject,
    }


@app.get("/logs")
def logs():
    db_path = cfg["DATABASE_PATH"]
    return get_last_processing_logs(db_path, limit=20)
