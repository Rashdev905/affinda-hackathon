from typing import Literal

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel

from .. import database

router = APIRouter(prefix="/api/manager", tags=["manager notifications"])


class ManagerUpdate(BaseModel):
    id: int
    incident_id: str
    volunteer_id: str
    volunteer_name: str
    message: str
    location: str
    created_at: str
    kind: Literal["report", "update"] = "update"


class ManagerUpdateFeed(BaseModel):
    cursor: int
    updates: list[ManagerUpdate]


@router.get("/updates", response_model=ManagerUpdateFeed)
def updates(response: Response, after: int | None = Query(default=None, ge=0)) -> ManagerUpdateFeed:
    response.headers["Cache-Control"] = "no-store"
    with database.connection() as db:
        # sqlite_sequence survives clearing incidents so device cursors stay valid.
        row = db.execute("SELECT seq FROM sqlite_sequence WHERE name = 'manager_updates'").fetchone()
        latest = row["seq"] if row else 0
        if after is None or after > latest:
            # A first subscription starts now, without notifying for historical updates.
            return ManagerUpdateFeed(cursor=latest, updates=[])
        rows = db.execute("SELECT * FROM manager_updates WHERE id > ? ORDER BY id LIMIT 100", (after,)).fetchall()
        return ManagerUpdateFeed(cursor=rows[-1]["id"] if rows else latest,
                                 updates=[ManagerUpdate(**dict(row)) for row in rows])
