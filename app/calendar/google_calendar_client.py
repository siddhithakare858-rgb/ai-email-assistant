from datetime import datetime
from typing import Optional

from googleapiclient.discovery import build

from app.config import load_config
from app.google.oauth import get_google_credentials
from app.tz import IST_TZ


class GoogleCalendarClient:
    def __init__(self):
        cfg = load_config()
        self.calendar_id = cfg["GOOGLE_CALENDAR_ID"]
        self.timezone = cfg["GOOGLE_TIMEZONE"]

    def _service(self):
        scopes = ["https://www.googleapis.com/auth/calendar.events"]
        creds = get_google_credentials(scopes)
        return build("calendar", "v3", credentials=creds)

    def create_event(
        self,
        summary: str,
        start_dt: datetime,
        end_dt: datetime,
        description: str,
        attendees_emails: Optional[list[str]] = None,
    ) -> tuple[str, Optional[str]]:
        """
        Create a Calendar event in Google Calendar.

        Returns:
            (event_id, html_link)
        """
        calendar = self._service()

        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=IST_TZ)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=IST_TZ)

        event = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_dt.isoformat(), "timeZone": self.timezone},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": self.timezone},
        }

        if attendees_emails:
            event["attendees"] = [{"email": e} for e in attendees_emails]

        created = calendar.events().insert(calendarId=self.calendar_id, body=event).execute()
        return created.get("id", ""), created.get("htmlLink")

