"""Load private backend settings independently of the terminal's working directory."""

import os
from pathlib import Path

from starlette.config import Config

BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
AI_SETTINGS = ("GEMINI_API_KEY", "PULSE_AI_MODE", "PULSE_ALERT_PROVIDER", "PULSE_GEMINI_MODEL")


def load_backend_environment(path: Path = BACKEND_ENV) -> None:
    if not path.is_file():
        return
    settings = Config(path)
    for name in AI_SETTINGS:
        value = settings.get(name, default=None)
        if value is not None:
            # Explicit terminal settings retain priority, including mock mode.
            os.environ.setdefault(name, value)
