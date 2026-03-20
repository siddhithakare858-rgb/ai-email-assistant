import base64
import re
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.google.oauth import get_google_credentials
from app.config import load_config


@dataclass(frozen=True)
class GmailMessage:
    message_id: str
    thread_id: str
    subject: str
    from_email: str
    message_rfc_id: Optional[str]
    body_text: str


def _decode_base64url(data: str) -> str:
    if not data:
        return ""
    raw = base64.urlsafe_b64decode(data.encode("utf-8"))
    return raw.decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    # Best-effort conversion for MVP; not a full HTML parser.
    html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<br\s*/?>", "\n", html)
    html = re.sub(r"(?is)<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def _extract_body_from_payload(payload: dict) -> str:
    """
    Walk Gmail message payload and extract:
    - prefer text/plain
    - fallback to text/html (converted to text)
    """
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def walk(part: dict):
        mime_type = part.get("mimeType", "")
        body = part.get("body", {}) or {}
        data = body.get("data")

        if part.get("parts"):
            for sub in part["parts"]:
                walk(sub)
            return

        if mime_type == "text/plain" and data:
            plain_parts.append(_decode_base64url(data))
        elif mime_type == "text/html" and data:
            html_parts.append(_decode_base64url(data))

    walk(payload or {})

    if plain_parts:
        return "\\n".join(p.strip() for p in plain_parts if p and p.strip())
    if html_parts:
        return _strip_html("\\n".join(p for p in html_parts if p))
    return ""


class GmailClient:
    def __init__(self):
        cfg = load_config()
        self.user_id = cfg["GMAIL_USER_ID"]

    def _service(self):
        scopes = [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
        ]
        try:
            creds = get_google_credentials(scopes)
        except RuntimeError as e:
            # Usually means OAuth token missing/invalid; callers can catch and fall back.
            raise RuntimeError(f"Gmail OAuth setup error: {e}") from e
        return build("gmail", "v1", credentials=creds)

    def get_message(self, message_id: str) -> dict:
        """
        Fetch a Gmail message by `message_id` and return a simple dict containing:
        - from_email
        - subject  
        - body_text
        """
        gmail_message = self.get_message_full(message_id)
        return {
            "from_email": gmail_message.from_email,
            "subject": gmail_message.subject,
            "body_text": gmail_message.body_text,
        }

    def get_message_full(self, message_id: str) -> GmailMessage:
        """
        Fetch a Gmail message by `message_id` and return a lightweight object containing:
        - from_email
        - subject
        - body_text
        """
        gmail = self._service()
        try:
            msg = gmail.users().messages().get(
                userId=self.user_id,
                id=message_id,
                format="full",
            ).execute()
        except HttpError as e:
            raise RuntimeError(f"Gmail API error fetching message {message_id}: {e}")

        headers = msg.get("payload", {}).get("headers", []) or []
        header_map = {h.get("name", "").lower(): h.get("value", "") for h in headers}

        subject = header_map.get("subject", "")
        from_email = header_map.get("from", "")
        message_rfc_id = header_map.get("message-id")
        thread_id = msg.get("threadId", "")

        # Extract just the email address if header includes a name.
        m = re.search(r"<([^>]+)>", from_email)
        from_email_clean = m.group(1) if m else from_email.strip()

        body_text = _extract_body_from_payload(msg.get("payload", {}))
        return GmailMessage(
            message_id=message_id,
            thread_id=thread_id,
            subject=subject,
            from_email=from_email_clean,
            message_rfc_id=message_rfc_id,
            body_text=body_text,
        )

    def list_messages(self, max_results=5) -> list[str]:
        """
        List latest message IDs from inbox.
        
        Args:
            max_results: Maximum number of messages to return (default: 5)
            
        Returns:
            List of message IDs
        """
        gmail = self._service()
        try:
            response = gmail.users().messages().list(
                userId=self.user_id,
                maxResults=max_results,
                labelIds=["INBOX"]
            ).execute()
            
            messages = response.get("messages", [])
            return [msg["id"] for msg in messages]
            
        except HttpError as e:
            raise RuntimeError(f"Gmail API error listing messages: {e}")

    def send_confirmation_reply(
        self,
        *,
        to_email: str,
        organizer_email: str,
        original: GmailMessage,
        meeting_start_iso: str,
        meeting_end_iso: str,
        calendar_link: Optional[str] = None,
        participant_emails: list[str],
    ) -> str:
        """
        Send a single reply email to `to_email` confirming the meeting time.
        Includes the required disclaimer in the email body.
        """
        gmail = self._service()

        subject = original.subject or "Meeting Confirmation"
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        disclaimer = "This email was generated by an experimental AI assistant."
        participants = ", ".join(participant_emails)
        calendar_line = f"Calendar: {calendar_link}" if calendar_link else ""

        body = (
            f"Hi,\n\n"
            f"Confirmed meeting time: {meeting_start_iso} - {meeting_end_iso} (IST).\n"
            f"Participants: {participants}\n"
            f"{calendar_line}\n\n"
            f"{disclaimer}\n"
        ).strip()

        msg = EmailMessage()
        msg["To"] = to_email
        msg["From"] = organizer_email
        msg["Subject"] = subject
        if original.message_rfc_id:
            msg["In-Reply-To"] = original.message_rfc_id
            msg["References"] = original.message_rfc_id
        msg.set_content(body)

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        sent = gmail.users().messages().send(
            userId=self.user_id,
            body={"raw": raw},
        ).execute()
        return sent.get("id", "")

