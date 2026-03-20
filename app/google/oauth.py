import os
import json
from typing import Sequence

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import load_config


def get_google_credentials(scopes: Sequence[str]) -> Credentials:
    """
    MVP OAuth helper:
    - Checks for TOKEN_JSON environment variable first (for deployments like Render)
    - Loads saved OAuth token from `GOOGLE_OAUTH_TOKEN_PATH`
    - Refreshes token if expired and refresh_token exists
    - If token doesn't exist, instructs to run `python scripts/auth_google.py`
    """
    cfg = load_config()
    token_path = cfg["GOOGLE_OAUTH_TOKEN_PATH"]
    credentials_path = cfg["GOOGLE_CLIENT_SECRETS_PATH"]

    # Check for TOKEN_JSON environment variable first (for deployments)
    token_json_env = os.getenv("TOKEN_JSON")
    if token_json_env:
        # Create token.json from environment variable
        os.makedirs(os.path.dirname(token_path), exist_ok=True)
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(token_json_env)
        print(f"[OAuth] Created token.json from TOKEN_JSON environment variable")

    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, scopes=list(scopes))

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        os.makedirs(os.path.dirname(token_path), exist_ok=True)
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
        return creds

    # If we got here, token is missing or cannot be refreshed.
    raise RuntimeError(
        "Missing/invalid Google OAuth token. Run `python scripts/auth_google.py` first "
        f"to create: {token_path}"
    )


def run_oauth_flow(scopes: Sequence[str]) -> Credentials:
    cfg = load_config()
    credentials_path = cfg["GOOGLE_CLIENT_SECRETS_PATH"]
    token_path = cfg["GOOGLE_OAUTH_TOKEN_PATH"]

    flow = InstalledAppFlow.from_client_secrets_file(credentials_path, scopes=list(scopes))
    creds = flow.run_local_server(port=0)

    os.makedirs(os.path.dirname(token_path), exist_ok=True)
    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds

