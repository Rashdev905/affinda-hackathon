import pytest


@pytest.fixture(autouse=True)
def isolated_ai_configuration(monkeypatch):
    """A developer's configured key must not turn ordinary tests into API calls."""
    monkeypatch.setenv("PULSE_AI_MODE", "mock")
    monkeypatch.setenv("PULSE_ALERT_PROVIDER", "mock")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("PULSE_GEMINI_MODEL", raising=False)
