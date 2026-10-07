import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import database
from .routers import incidents, reports, resources, transcriptions

ANDROID_APK = Path(__file__).resolve().parents[2] / "artifacts" / "Pulse-Android.apk"


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.initialize()
    yield


app = FastAPI(title="Pulse · Riverside", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("PULSE_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(reports.router)
app.include_router(incidents.router)
app.include_router(resources.router)
app.include_router(transcriptions.router)


@app.get("/health")
def health():
    with database.connection() as db:
        db.execute("SELECT 1 FROM incidents LIMIT 1")
    return {"status": "ok", "service": "pulse", "parser_mode": "mock"}


@app.get("/downloads/pulse.apk", response_class=FileResponse, tags=["local demo"])
def download_android_app():
    """Serve only the built test APK, never arbitrary project files."""
    if not ANDROID_APK.is_file():
        raise HTTPException(status_code=404, detail="The Android APK has not been built yet.")
    return FileResponse(ANDROID_APK, media_type="application/vnd.android.package-archive", filename="Pulse-Android.apk")
