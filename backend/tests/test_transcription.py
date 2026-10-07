import io
import wave
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import transcription as speech


def wav(seconds=1, silence=False):
    samples = np.zeros(int(seconds * 16000), dtype=np.int16) if silence else (
        np.sin(np.arange(int(seconds * 16000)) * 440 * 2 * np.pi / 16000) * 12000
    ).astype(np.int16)
    data = io.BytesIO()
    with wave.open(data, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(samples.tobytes())
    return data.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "speech-test.db"))
    with TestClient(app) as test_client:
        yield test_client


def upload(client, data):
    return client.post("/api/transcriptions", files={"audio": ("voice.m4a", data, "audio/mp4")})


def test_transcription_returns_text_without_creating_an_incident(client, monkeypatch):
    calls = []

    def transcribe(audio, **options):
        calls.append(options)
        assert len(audio) == 16000
        return iter([SimpleNamespace(text=" Help at North Gate. ", no_speech_prob=0.05)]), None

    monkeypatch.setattr(speech, "get_model", lambda: SimpleNamespace(transcribe=transcribe))
    response = upload(client, wav())
    assert response.status_code == 200, response.text
    assert response.json() == {"text": "Help at North Gate.", "language": "en", "duration_seconds": 1.0}
    assert calls[0]["vad_filter"] is True
    assert client.get("/api/incidents").json() == []


@pytest.mark.parametrize("data, message", [(b"", "empty"), (b"not audio", "Could not read"), (wav(silence=True), "No speech"), (wav(0.05), "too short")], ids=["empty", "invalid", "silent", "short"])
def test_invalid_or_silent_recordings_do_not_reach_model(client, monkeypatch, data, message):
    monkeypatch.setattr(speech, "get_model", lambda: pytest.fail("Invalid audio must not reach the model"))
    response = upload(client, data)
    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_size_and_duration_limits(client, monkeypatch):
    monkeypatch.setattr(speech, "MAX_AUDIO_BYTES", 100)
    assert upload(client, b"x" * 101).status_code == 413
    monkeypatch.setattr(speech, "MAX_AUDIO_BYTES", 10 * 1024 * 1024)
    monkeypatch.setattr(speech, "MAX_AUDIO_SECONDS", 1)
    assert upload(client, wav(1.1)).status_code == 413


def test_missing_model_and_concurrent_request_are_recoverable(client, monkeypatch, tmp_path):
    monkeypatch.setattr(speech, "_model", None)
    monkeypatch.setenv("PULSE_SPEECH_MODEL_DIR", str(tmp_path / "missing"))
    response = upload(client, wav())
    assert response.status_code == 503
    assert "setup-speech.ps1" in response.json()["detail"]
    with speech._transcription_lock:
        response = upload(client, wav())
        assert response.status_code == 503
        assert "Another voice message" in response.json()["detail"]


def test_unrecognized_speech_returns_no_invented_report(client, monkeypatch):
    monkeypatch.setattr(speech, "get_model", lambda: SimpleNamespace(transcribe=lambda *args, **kwargs: (iter([]), None)))
    assert upload(client, wav()).status_code == 422
    assert client.get("/api/incidents").json() == []
