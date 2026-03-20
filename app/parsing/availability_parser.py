import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import dateparser

from app.tz import IST_TZ


@dataclass(frozen=True)
class AvailabilityInterval:
    start: datetime
    end: datetime


def _normalize_meridiem(hour: int, meridiem: Optional[str]) -> int:
    """
    Convert 12-hour clock + meridiem into 24-hour clock.
    MVP: if meridiem is missing, treat `hour` as 24-hour as-is.
    """
    if meridiem is None:
        return hour

    meridiem = meridiem.upper()
    if meridiem == "AM":
        return 12 if hour == 12 else hour
    if meridiem == "PM":
        return 12 if hour == 12 else hour + 12
    return hour


def _parse_time_token(hour_str: str, minute_str: Optional[str], meridiem: Optional[str]) -> tuple[int, int]:
    hour = int(hour_str)
    minute = int(minute_str) if minute_str else 0
    return _normalize_meridiem(hour, meridiem), minute


def _find_target_date(text: str, reference_ist: datetime) -> datetime.date:
    t = text.lower()
    if "today" in t:
        return reference_ist.date()
    if "tomorrow" in t:
        return (reference_ist + timedelta(days=1)).date()
    # MVP default when no day keyword is present.
    return (reference_ist + timedelta(days=1)).date()


def _parse_relative_date_with_dateparser(text: str, reference_ist: datetime) -> Optional[datetime.date]:
    """
    Use `dateparser` to interpret relative date phrases like "next Monday".
    Returns a date in IST.
    """
    try:
        parsed_dt = dateparser.parse(
            text,
            settings={
                "RELATIVE_BASE": reference_ist,
                "PREFER_DATES_FROM": "future",
                "TIMEZONE": "Asia/Kolkata",
                "RETURN_AS_TIMEZONE_AWARE": True,
            },
        )
    except Exception:
        return None

    if parsed_dt is None:
        return None

    if parsed_dt.tzinfo is not None:
        parsed_dt = parsed_dt.astimezone(IST_TZ)
    else:
        parsed_dt = parsed_dt.replace(tzinfo=IST_TZ)

    return parsed_dt.date()


def _extract_target_dates(text: str, reference_ist: datetime) -> list[datetime.date]:
    """
    Extract candidate dates from natural language.
    If no supported day phrase is present, defaults to tomorrow (MVP behavior).
    """
    t = text.lower()
    dates: list[datetime.date] = []

    def _add(d: Optional[datetime.date]) -> None:
        if d is None:
            return
        if d not in dates:
            dates.append(d)

    if "weekend" in t:
        # Weekend is Saturday + Sunday.
        weekday = reference_ist.weekday()  # Monday=0 ... Sunday=6
        sat_weekday = 5  # Saturday
        days_until_sat = (sat_weekday - weekday) % 7
        sat_date = (reference_ist + timedelta(days=days_until_sat)).date()
        sun_date = (sat_date + timedelta(days=1))
        dates.extend([sat_date, sun_date])

    # next Monday (or "next mon")
    if re.search(r"\bnext\s+mon(day)?\b", t):
        _add(_parse_relative_date_with_dateparser("next monday", reference_ist))

        # Fallback if dateparser fails.
        if not dates:
            weekday = reference_ist.weekday()  # Monday=0
            days_ahead = (0 - weekday + 7) % 7  # 0 => Monday
            if days_ahead == 0:
                days_ahead = 7
            _add((reference_ist + timedelta(days=days_ahead)).date())

    if "tomorrow" in t:
        _add(_parse_relative_date_with_dateparser("tomorrow", reference_ist) or (reference_ist + timedelta(days=1)).date())

    if "today" in t:
        _add(_parse_relative_date_with_dateparser("today", reference_ist) or reference_ist.date())

    if not dates:
        # MVP default when no day keyword is present.
        return [(reference_ist + timedelta(days=1)).date()]

    return sorted(dates)


def _strip_html_to_text(html: str) -> str:
    # Very small/fragile best-effort; keeps MVP simple.
    html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<br\s*/?>", "\n", html)
    html = re.sub(r"(?is)<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def parse_availability(email_text: str, reference_ist: Optional[datetime] = None) -> list[AvailabilityInterval]:
    """
    Parse a minimal set of patterns into time windows in IST.

    Supported MVP examples:
    - "I am free tomorrow 10-12"
    - "Available at 3 PM"
    - "Free today 10-12 PM"
    - "after lunch"
    - "before 5pm"
    - "evening"
    - "morning"
    - "next Monday"
    - "tomorrow evening"
    - "weekend"

    Notes:
    - Generic phrases like "morning"/"evening"/"after lunch" are treated as ambiguous and
      return multiple candidate `AvailabilityInterval`s.
    - All returned datetimes are normalized to IST.

    Output:
    - Returns 0+ AvailabilityInterval objects. Caller decides what to do if none found.
    """
    if reference_ist is None:
        reference_ist = datetime.now(IST_TZ)

    text = email_text or ""
    # In case caller accidentally provides HTML.
    if "<html" in text.lower() and ">" in text:
        text = _strip_html_to_text(text)

    t = text.lower()
    day_phrase_present = any(k in t for k in ["today", "tomorrow", "weekend"]) or bool(re.search(r"\bnext\s+mon(day)?\b", t))
    time_phrase_present = bool(
        re.search(r"\b(morning|evening)\b", t)
        or re.search(r"\bafter\s+lunch\b", t)
        or re.search(r"\bbefore\s+\d{1,2}(\:\d{2})?\s*(am|pm)\b", t)
    )

    target_dates = _extract_target_dates(text, reference_ist)

    # Early check: if the email contains "before Xpm", we should prefer the natural-language
    # parser over numeric "single time" parsing (which would otherwise interpret "Xpm"
    # as a standalone 1-hour window).
    before_match = re.search(
        r"\bbefore\s*(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ampm>AM|PM|am|pm)\b",
        t,
    )

    # 1) Try time ranges: "10-12", "10 AM-12 PM", "3-4 PM", "10:30-12:15"
    range_re = re.compile(
        r"(?P<h1>\d{1,2})(?::(?P<m1>\d{2}))?\s*(?P<ampm1>AM|PM|am|pm)?"
        r"\s*[-–]\s*"
        r"(?P<h2>\d{1,2})(?::(?P<m2>\d{2}))?\s*(?P<ampm2>AM|PM|am|pm)?",
        re.IGNORECASE,
    )

    intervals: list[AvailabilityInterval] = []
    for match in range_re.finditer(text):
        # Validation: ignore ranges that are part of a "before Xpm" expression.
        if before_match is not None:
            context = t[max(0, match.start() - 20) : match.start()]
            if "before" in context:
                continue

        h1 = match.group("h1")
        m1 = match.group("m1")
        ampm1 = match.group("ampm1")

        h2 = match.group("h2")
        m2 = match.group("m2")
        ampm2 = match.group("ampm2")

        # If range ends omit AM/PM but start included it, reuse start meridiem.
        if ampm2 is None and ampm1 is not None:
            ampm2 = ampm1

        start_hour, start_min = _parse_time_token(h1, m1, ampm1)
        end_hour, end_min = _parse_time_token(h2, m2, ampm2)

        # Validation: numeric ranges must resolve to valid 24h time.
        if not (0 <= start_hour <= 23 and 0 <= end_hour <= 23):
            continue
        if not (0 <= start_min <= 59 and 0 <= end_min <= 59):
            continue

        for target_date in target_dates:
            try:
                start_dt = datetime(
                    year=target_date.year,
                    month=target_date.month,
                    day=target_date.day,
                    hour=start_hour,
                    minute=start_min,
                    tzinfo=IST_TZ,
                )
                end_dt = datetime(
                    year=target_date.year,
                    month=target_date.month,
                    day=target_date.day,
                    hour=end_hour,
                    minute=end_min,
                    tzinfo=IST_TZ,
                )
            except ValueError:
                continue

            if end_dt <= start_dt:
                # MVP adjustment: treat as a same-day mistake by forcing at least 1 hour.
                end_dt = start_dt + timedelta(hours=1)

            if end_dt <= start_dt:
                continue

            intervals.append(AvailabilityInterval(start=start_dt, end=end_dt))

    if intervals:
        return intervals

    # 2) Try single times like "Available at 3 PM" => 1 hour window.
    single_re = re.compile(
        r"(?:at\s*)?(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ampm>AM|PM|am|pm)"
    )
    for match in single_re.finditer(text):
        # Validation: ignore single times that are part of a "before Xpm" expression.
        if before_match is not None:
            context = t[max(0, match.start() - 20) : match.start()]
            if "before" in context:
                continue

        h = match.group("h")
        m = match.group("m")
        ampm = match.group("ampm")

        hour, minute = _parse_time_token(h, m, ampm)
        # Validation: numeric single times must resolve to valid 24h time.
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            continue
        for target_date in target_dates:
            try:
                start_dt = datetime(
                    year=target_date.year,
                    month=target_date.month,
                    day=target_date.day,
                    hour=hour,
                    minute=minute,
                    tzinfo=IST_TZ,
                )
                end_dt = start_dt + timedelta(hours=1)
            except ValueError:
                continue
            if end_dt <= start_dt:
                continue
            intervals.append(AvailabilityInterval(start=start_dt, end=end_dt))

    if intervals:
        return intervals

    # 3) Natural-language day/time phrases (dateparser + explicit mappings)
    if not (day_phrase_present or time_phrase_present):
        return []

    # `before_match` was computed earlier for precedence/validation.
    after_lunch_present = bool(re.search(r"\bafter\s+lunch\b", t))
    morning_present = bool(re.search(r"\bmorning\b", t))
    evening_present = bool(re.search(r"\bevening\b", t))

    def _make_interval_for_date(d: datetime.date, sh: int, sm: int, eh: int, em: int) -> Optional[AvailabilityInterval]:
        if not (0 <= sh <= 23 and 0 <= eh <= 23 and 0 <= sm <= 59 and 0 <= em <= 59):
            return None
        start_dt = datetime(year=d.year, month=d.month, day=d.day, hour=sh, minute=sm, tzinfo=IST_TZ)
        end_dt = datetime(year=d.year, month=d.month, day=d.day, hour=eh, minute=em, tzinfo=IST_TZ)
        if end_dt <= start_dt:
            return None
        return AvailabilityInterval(start=start_dt, end=end_dt)

    time_windows: list[tuple[int, int, int, int]] = []

    if before_match:
        h = before_match.group("h")
        m = before_match.group("m")
        ampm = before_match.group("ampm")
        end_hour, end_min = _parse_time_token(h, m, ampm)
        maybe = _make_interval_for_date(target_dates[0], 0, 0, end_hour, end_min)
        if maybe is None:
            return []
        time_windows = [(0, 0, end_hour, end_min)]

    elif after_lunch_present:
        # Ambiguous "lunch" timing => multiple candidate intervals.
        time_windows = [(12, 30, 18, 0), (13, 30, 20, 0)]

    else:
        if morning_present:
            # Ambiguous "morning" => multiple candidate windows.
            time_windows.extend([(6, 0, 12, 0), (8, 0, 12, 0)])
        if evening_present:
            # Ambiguous "evening" => multiple candidate windows.
            time_windows.extend([(17, 0, 21, 0), (18, 0, 22, 0)])

        if not time_windows:
            # Date-only phrases like "next Monday" / "weekend" without time-of-day.
            time_windows = [(9, 0, 17, 0)]

    for d in target_dates:
        for sh, sm, eh, em in time_windows:
            interval = _make_interval_for_date(d, sh, sm, eh, em)
            if interval is None:
                continue
            intervals.append(interval)

    return intervals

