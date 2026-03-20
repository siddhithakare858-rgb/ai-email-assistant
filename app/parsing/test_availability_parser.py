import unittest
from datetime import datetime, timedelta

from app.parsing.availability_parser import parse_availability
from app.tz import IST_TZ


class TestAvailabilityParserNaturalLanguage(unittest.TestCase):
    def setUp(self) -> None:
        # Fixed reference time (IST) so "tomorrow" and "next Monday" are deterministic.
        self.ref = datetime(2026, 3, 19, 10, 0, tzinfo=IST_TZ)  # Thu
        self.tomorrow = (self.ref + timedelta(days=1)).date()

    def test_before_5pm(self):
        intervals = parse_availability("Available before 5pm", reference_ist=self.ref)
        self.assertEqual(len(intervals), 1)
        self.assertEqual(intervals[0].start.hour, 0)
        self.assertEqual(intervals[0].end.hour, 17)
        self.assertEqual(intervals[0].start.minute, 0)
        self.assertEqual(intervals[0].end.minute, 0)
        self.assertEqual(intervals[0].start.date().isoformat(), self.tomorrow.isoformat())

    def test_morning_ambiguous(self):
        intervals = parse_availability("morning", reference_ist=self.ref)
        # Two candidate windows:
        # 1) 06:00 - 12:00
        # 2) 08:00 - 12:00
        self.assertEqual(len(intervals), 2)
        self.assertEqual(intervals[0].start.hour, 6)
        self.assertEqual(intervals[1].start.hour, 8)

    def test_evening_ambiguous(self):
        intervals = parse_availability("evening", reference_ist=self.ref)
        # Two candidate windows: 17:00-21:00 and 18:00-22:00
        self.assertEqual(len(intervals), 2)
        self.assertEqual(intervals[0].start.hour, 17)
        self.assertEqual(intervals[1].start.hour, 18)

    def test_after_lunch_ambiguous(self):
        intervals = parse_availability("after lunch", reference_ist=self.ref)
        # Two candidate windows:
        # 1) 12:30 - 18:00
        # 2) 13:30 - 20:00
        self.assertEqual(len(intervals), 2)
        self.assertEqual(intervals[0].start.hour, 12)
        self.assertEqual(intervals[0].start.minute, 30)
        self.assertEqual(intervals[1].start.hour, 13)
        self.assertEqual(intervals[1].start.minute, 30)

    def test_tomorrow_evening(self):
        intervals = parse_availability("tomorrow evening", reference_ist=self.ref)
        self.assertEqual(len(intervals), 2)
        self.assertTrue(all(i.start.date().isoformat() == self.tomorrow.isoformat() for i in intervals))

    def test_next_monday_date_only_defaults(self):
        intervals = parse_availability("next Monday", reference_ist=self.ref)
        # next Monday from Thu 2026-03-19 is 2026-03-23.
        expected_date = datetime(2026, 3, 23, tzinfo=IST_TZ).date().isoformat()
        self.assertEqual(len(intervals), 1)
        self.assertEqual(intervals[0].start.date().isoformat(), expected_date)
        self.assertEqual(intervals[0].start.hour, 9)
        self.assertEqual(intervals[0].end.hour, 17)

    def test_weekend_two_days(self):
        intervals = parse_availability("weekend", reference_ist=self.ref)
        # Thu => upcoming weekend is Sat 2026-03-21 and Sun 2026-03-22.
        expected_sat = datetime(2026, 3, 21, tzinfo=IST_TZ).date().isoformat()
        expected_sun = datetime(2026, 3, 22, tzinfo=IST_TZ).date().isoformat()
        self.assertEqual(len(intervals), 2)
        self.assertEqual(intervals[0].start.date().isoformat(), expected_sat)
        self.assertEqual(intervals[1].start.date().isoformat(), expected_sun)

    def test_invalid_before_time_returns_empty(self):
        intervals = parse_availability("before 25pm", reference_ist=self.ref)
        self.assertEqual(intervals, [])


if __name__ == "__main__":
    unittest.main()

