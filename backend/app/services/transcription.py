"""Local CPU speech recognition. Model files and audio never go to a cloud API."""

import io
import os
from pathlib import Path
from threading import Lock

import av
import numpy as np

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 120
SAMPLE_RATE = 16000
_model = None
_model_lock = Lock()
_transcription_lock = Lock()


class SpeechError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def model_directory() -> Path:
    return Path(os.getenv("PULSE_SPEECH_MODEL_DIR", str(Path(__file__).resolve().parents[2] / "models" / "base.en")))


def get_model():
    global _model
    with _model_lock:
        if _model is None:
            directory = model_directory()
            if not (directory / "model.bin").is_file():
                raise SpeechError("Speech recognition is not set up on the laptop. Run scripts/setup-speech.ps1, or type your report.", 503)
            from faster_whisper import WhisperModel

            _model = WhisperModel(str(directory), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
    return _model


def decode_recording(data: bytes) -> np.ndarray:
    """Decode phone AAC/M4A (or other supported audio) with a bounded duration."""
    if not data:
        raise SpeechError("The recording is empty. Please record your message again.")
    if len(data) > MAX_AUDIO_BYTES:
        raise SpeechError("Recording is too large. Keep voice messages under two minutes.", 413)
    chunks = []
    samples = 0
    try:
        with av.open(io.BytesIO(data)) as container:
            if not container.streams.audio:
                raise SpeechError("This file has no audio. Please record your message again.")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                frame.pts = None
                for converted in resampler.resample(frame):
                    samples += converted.samples
                    if samples > MAX_AUDIO_SECONDS * SAMPLE_RATE:
                        raise SpeechError("Recording is too long. Keep voice messages under two minutes.", 413)
                    chunks.append(converted.to_ndarray().reshape(-1))
            for converted in resampler.resample(None):
                samples += converted.samples
                chunks.append(converted.to_ndarray().reshape(-1))
    except (av.FFmpegError, ValueError, EOFError) as exc:
        raise SpeechError("Could not read this recording. Please record your message again.") from exc
    if samples > MAX_AUDIO_SECONDS * SAMPLE_RATE:
        raise SpeechError("Recording is too long. Keep voice messages under two minutes.", 413)
    if samples < SAMPLE_RATE // 4:
        raise SpeechError("Recording is too short. Please say what happened and where.")
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def transcribe_recording(data: bytes) -> dict:
    # Do not queue a large number of emergency recordings behind CPU inference.
    if not _transcription_lock.acquire(blocking=False):
        raise SpeechError("Another voice message is being transcribed. Retry in a moment, or type your report.", 503)
    try:
        audio = decode_recording(data)
        if np.max(np.abs(audio)) < 0.001:
            raise SpeechError("No speech was detected. Try again closer to the microphone, or type your report.")
        model = get_model()
        segments, _ = model.transcribe(
            audio, language="en", beam_size=3, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments if segment.no_speech_prob < 0.6).strip()
        if not text:
            raise SpeechError("No clear speech was detected. Please try again, or type your report.")
        if len(text) > 5000:
            raise SpeechError("Transcript is too long. Please record a shorter message.")
        return {"text": text, "language": "en", "duration_seconds": round(len(audio) / SAMPLE_RATE, 2)}
    finally:
        _transcription_lock.release()


if __name__ == "__main__":
    from faster_whisper import download_model

    directory = model_directory()
    directory.mkdir(parents=True, exist_ok=True)
    download_model("base.en", output_dir=str(directory))
    get_model()
    print(f"Local English speech model ready: {directory}")
