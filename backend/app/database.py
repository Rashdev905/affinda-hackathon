import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .schemas import Incident, Resource
from .seed import seed_resources


def database_path() -> Path:
    return Path(os.getenv("PULSE_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "pulse.db")))


@contextmanager
def connection(write: bool = False) -> Iterator[sqlite3.Connection]:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        if write:
            # Serialize decisions so simultaneous approvals cannot double-assign a responder.
            db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize() -> None:
    with connection(write=True) as db:
        db.execute("CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("""CREATE TABLE IF NOT EXISTS volunteer_alerts (
            id TEXT PRIMARY KEY, incident_id TEXT NOT NULL,
            volunteer_id TEXT NOT NULL, payload TEXT NOT NULL)""")
        db.execute("CREATE INDEX IF NOT EXISTS alerts_by_volunteer ON volunteer_alerts(volunteer_id)")
        for resource in seed_resources():
            db.execute("INSERT OR IGNORE INTO resources VALUES (?, ?)", (resource.id, resource.model_dump_json()))
            if resource.id in {"VOL-015", "VOL-016"}:
                row = db.execute("SELECT payload FROM resources WHERE id = ?", (resource.id,)).fetchone()
                existing = Resource.model_validate_json(row["payload"])
                existing.name, existing.role = resource.name, resource.role
                db.execute("UPDATE resources SET payload = ? WHERE id = ?", (existing.model_dump_json(), resource.id))


def list_resources(db: sqlite3.Connection) -> list[Resource]:
    return [Resource.model_validate_json(row["payload"]) for row in db.execute("SELECT payload FROM resources ORDER BY id")]


def save_resource(db: sqlite3.Connection, resource: Resource) -> None:
    db.execute("UPDATE resources SET payload = ? WHERE id = ?", (resource.model_dump_json(), resource.id))


def list_incidents(db: sqlite3.Connection) -> list[Incident]:
    return [Incident.model_validate_json(row["payload"]) for row in db.execute("SELECT payload FROM incidents")]


def get_incident(db: sqlite3.Connection, incident_id: str) -> Incident | None:
    row = db.execute("SELECT payload FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return Incident.model_validate_json(row["payload"]) if row else None


def save_incident(db: sqlite3.Connection, incident: Incident) -> None:
    db.execute(
        "INSERT INTO incidents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
        (incident.id, incident.model_dump_json()),
    )
def delete_all_incidents(db: sqlite3.Connection) -> int:
    cursor = db.execute("DELETE FROM incidents")
    return cursor.rowcount
