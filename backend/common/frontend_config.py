"""Shared configuration for links back to the frontend."""
import os
from pathlib import Path

from dotenv import dotenv_values


ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def frontend_url() -> str:
    file_env = dotenv_values(ROOT_ENV_FILE)
    return (os.getenv("FRONTEND_URL") or str(file_env.get("FRONTEND_URL") or "")
            or "http://localhost:5173").rstrip("/")
