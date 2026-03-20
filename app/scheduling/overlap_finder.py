from dataclasses import dataclass
from datetime import datetime

from app.parsing.availability_parser import AvailabilityInterval


@dataclass(frozen=True)
class Interval:
    start: datetime
    end: datetime


def _normalize(intervals: list[Interval]) -> list[Interval]:
    # Sort and merge overlapping/adjacent intervals to keep overlap results small.
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda x: x.start)
    merged: list[Interval] = [intervals[0]]
    for cur in intervals[1:]:
        last = merged[-1]
        if cur.start <= last.end:  # overlap or adjacency
            merged[-1] = Interval(start=last.start, end=max(last.end, cur.end))
        else:
            merged.append(cur)
    return merged


def intersect_interval_sets(a_set: list[Interval], b_set: list[Interval]) -> list[Interval]:
    """
    Compute all overlap segments between two sets of intervals.
    """
    out: list[Interval] = []
    for a in a_set:
        for b in b_set:
            start = max(a.start, b.start)
            end = min(a.end, b.end)
            if start < end:
                out.append(Interval(start=start, end=end))
    return _normalize(out)


def find_overlapping_slots(participant_intervals: list[list[AvailabilityInterval]]) -> list[Interval]:
    """
    Find common overlap across all participants.

    participant_intervals: [
      [AvailabilityInterval(...), ...],   # participant 1
      [AvailabilityInterval(...), ...],   # participant 2
    ]
    """
    if not participant_intervals:
        return []

    # Convert first participant to Interval objects.
    current = [
        Interval(start=i.start, end=i.end)
        for i in participant_intervals[0]
        if i.end > i.start
    ]

    for idx in range(1, len(participant_intervals)):
        nxt = [
            Interval(start=i.start, end=i.end)
            for i in participant_intervals[idx]
            if i.end > i.start
        ]
        current = intersect_interval_sets(current, nxt)
        if not current:
            return []

    return current

