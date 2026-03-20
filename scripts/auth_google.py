import sys

from app.google.oauth import run_oauth_flow


if __name__ == "__main__":
    scopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar.events",
    ]

    try:
        run_oauth_flow(scopes)
        print("OAuth token saved. You can now start the FastAPI server.")
    except Exception as e:
        print(f"OAuth setup failed: {e}", file=sys.stderr)
        sys.exit(1)

