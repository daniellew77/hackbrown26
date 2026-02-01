from pydantic import BaseModel
from typing import Tuple

class SystemConfig(BaseModel):
    default_start_location: Tuple[float, float] = (41.8240, -71.4128)

# Global instance
_config = SystemConfig()

def get_config() -> SystemConfig:
    return _config

def update_start_location(lat: float, lng: float):
    _config.default_start_location = (lat, lng)
