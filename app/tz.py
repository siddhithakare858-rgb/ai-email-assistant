from datetime import timedelta, timezone


# MVP assumption: fixed IST offset (no daylight saving), UTC+05:30.
IST_TZ = timezone(timedelta(hours=5, minutes=30))

