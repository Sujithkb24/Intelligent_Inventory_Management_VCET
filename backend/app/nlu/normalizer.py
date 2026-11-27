import re
import unicodedata


def normalize(text):
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("utf-8").lower()
    folded = re.sub(r"[^a-z0-9_.+\-/:]+", " ", folded)
    return re.sub(r"\s+", " ", folded).strip()


def tokens(text):
    return normalize(text).split()
