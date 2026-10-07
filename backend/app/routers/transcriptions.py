import logging

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..services.transcription import MAX_AUDIO_BYTES, SpeechError, transcribe_recording

router = APIRouter(prefix="/api/transcriptions", tags=["voice"])
logger = logging.getLogger(__name__)


class Transcript(BaseModel):
    text: str
    language: str
    duration_seconds: float


@router.post("", response_model=Transcript)
async def transcribe(audio: UploadFile):
    """Return an editable transcript; this does not create or dispatch an incident."""
    try:
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        return await run_in_threadpool(transcribe_recording, data)
    except SpeechError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Local speech recognition failed")
        raise HTTPException(status_code=503, detail="Speech recognition is temporarily unavailable. Retry, or type your report.") from exc
    finally:
        await audio.close()
