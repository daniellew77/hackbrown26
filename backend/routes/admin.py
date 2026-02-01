from fastapi import APIRouter
from pydantic import BaseModel
from config import get_config, update_start_location

router = APIRouter(tags=["admin"])

class ConfigUpdate(BaseModel):
    lat: float
    lng: float

@router.get("/admin/config")
async def get_admin_config():
    config = get_config()
    return {
        "start_location": {
            "lat": config.default_start_location[0],
            "lng": config.default_start_location[1]
        }
    }

@router.post("/admin/config")
async def update_admin_config(data: ConfigUpdate):
    update_start_location(data.lat, data.lng)
    return {"success": True, "start_location": {"lat": data.lat, "lng": data.lng}}
