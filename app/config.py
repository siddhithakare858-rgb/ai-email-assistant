import os
from dotenv import load_dotenv


def load_config():
    """
    Load environment variables from .env (if present) and return a simple config dict.
    MVP approach: keep config explicit and avoid extra abstractions.
    """
    load_dotenv()
    return {
        # New env var names (per integration requirements)
        # - GOOGLE_CREDENTIALS: path to credentials.json
        # - TOKEN_PATH: path where OAuth token.json should be stored
        "GOOGLE_CLIENT_SECRETS_PATH": os.getenv(
            "GOOGLE_CREDENTIALS",
            os.getenv("GOOGLE_CLIENT_SECRETS_PATH", "credentials.json"),
        ),
        "GOOGLE_OAUTH_TOKEN_PATH": os.getenv(
            "TOKEN_PATH",
            os.getenv("GOOGLE_OAUTH_TOKEN_PATH", "data/token.json"),
        ),
        "GOOGLE_CALENDAR_ID": os.getenv("GOOGLE_CALENDAR_ID", "primary"),
        "GOOGLE_TIMEZONE": os.getenv("GOOGLE_TIMEZONE", "Asia/Kolkata"),
        "GMAIL_USER_ID": os.getenv("GMAIL_USER_ID", "me"),
        "DATABASE_PATH": os.getenv("DATABASE_PATH", "data/availability.db"),
    }

