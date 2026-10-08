from app.config import AI_SETTINGS, load_backend_environment
from app.services.ai_analysis import alert_provider_mode, provider_mode


def clear_settings(monkeypatch):
    for name in AI_SETTINGS:
        monkeypatch.delenv(name, raising=False)


def test_saved_configuration_enables_both_providers_from_any_directory(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    settings = tmp_path / ".env"
    settings.write_text('GEMINI_API_KEY="fake-test-key"\nPULSE_AI_MODE=gemini\nPULSE_ALERT_PROVIDER=gemini\n')
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    load_backend_environment(settings)
    assert provider_mode() == "gemini"
    assert alert_provider_mode() == "gemini"


def test_explicit_terminal_provider_overrides_saved_settings(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    settings = tmp_path / ".env"
    settings.write_text('GEMINI_API_KEY=fake-test-key\nPULSE_AI_MODE=gemini\nPULSE_ALERT_PROVIDER=gemini\n')
    monkeypatch.setenv("PULSE_ALERT_PROVIDER", "mock")
    load_backend_environment(settings)
    assert provider_mode() == "gemini"
    assert alert_provider_mode() == "mock"


def test_missing_configuration_preserves_offline_mode(tmp_path, monkeypatch):
    clear_settings(monkeypatch)
    load_backend_environment(tmp_path / "missing.env")
    assert provider_mode() == "mock"
    assert alert_provider_mode() == "mock"
