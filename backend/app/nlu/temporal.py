import calendar
import re
from datetime import date, timedelta

from app.nlu import normalizer


def parse(phrases, today, config=None):
    config = config or {}
    text = " ".join(normalizer.normalize(p) for p in (phrases or []))
    result = {"phrases": text, "start_date": None, "end_date": None, "as_of": None, "ambiguous": False}
    if not text:
        return result
    vague = {normalizer.normalize(p) for p in config.get("temporal_phrases", []) if normalizer.normalize(p) in ("soon", "later")}
    if vague.intersection(text.split()):
        result["ambiguous"] = True
    if "today" in text.split():
        result["as_of"] = today.isoformat()
    if "tomorrow" in text.split():
        result["as_of"] = (today + timedelta(days=1)).isoformat()
    if "next week" in text:
        start = today + timedelta(days=7 - today.weekday())
        result["start_date"] = start.isoformat()
        result["end_date"] = (start + timedelta(days=6)).isoformat()
    if "this week" in text:
        start = today - timedelta(days=today.weekday())
        result["start_date"] = start.isoformat()
        result["end_date"] = (start + timedelta(days=6)).isoformat()
    if "next month" in text:
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        result["start_date"] = date(year, month, 1).isoformat()
        result["end_date"] = date(year, month, calendar.monthrange(year, month)[1]).isoformat()
    weekdays = {name.lower(): index for index, name in enumerate(calendar.day_name)}
    for name, index in weekdays.items():
        if f"by {name}" in text or f"on {name}" in text:
            delta = (index - today.weekday()) % 7
            result["as_of"] = (today + timedelta(days=delta or 7)).isoformat()
    match = re.search(r"(?:in|after)\s+(\d+)\s*(day|days|week|weeks)", text)
    if match:
        factor = 7 if match.group(2).startswith("week") else 1
        result["as_of"] = (today + timedelta(days=int(match.group(1)) * factor)).isoformat()
    return result
