from fastapi import APIRouter

from .. import database
from ..models import ZONES
from ..schemas import Resource

router = APIRouter(prefix="/api", tags=["resources"])


@router.get("/resources", response_model=list[Resource])
def get_resources() -> list[Resource]:
    with database.connection() as db:
        return database.list_resources(db)


@router.get("/zones", response_model=list[str])
def get_zones() -> list[str]:
    return ZONES

