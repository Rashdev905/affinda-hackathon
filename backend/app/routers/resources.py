from fastapi import APIRouter, HTTPException

from .. import database
from ..models import ZONES
from ..schemas import Resource

router = APIRouter(prefix="/api", tags=["resources"])


@router.get("/resources", response_model=list[Resource])
def get_resources() -> list[Resource]:
    with database.connection() as db:
        return database.list_resources(db)


@router.get("/volunteers/{identifier}", response_model=Resource)
def get_volunteer_by_identifier(identifier: str) -> Resource:
    if len(identifier) != 4 or not identifier.isascii() or not identifier.isdigit() or identifier == "0000":
        raise HTTPException(status_code=422, detail="Enter your four-digit volunteer identifier.")
    resource_id = f"VOL-{int(identifier):03d}"
    with database.connection() as db:
        resource = next((item for item in database.list_resources(db) if item.id == resource_id), None)
    if resource is None:
        raise HTTPException(status_code=404, detail="That volunteer identifier was not found.")
    return resource


@router.get("/zones", response_model=list[str])
def get_zones() -> list[str]:
    return ZONES

