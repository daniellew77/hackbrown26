"""
Tour API Routes
Endpoints for tour creation, management, and state updates.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path

from models.state import TourManager, TourStatus
from services.routing import generate_route, get_walking_directions, check_poi_proximity

router = APIRouter(tags=["tour"])

# Global tour manager (in production, use dependency injection)
tour_manager = TourManager()


class CreateTourRequest(BaseModel):
    """Request body for creating a new tour."""
    tour_length: int = 60
    theme: str = "historical"
    sound_effects: bool = True
    guide_personality: str = "friendly"
    interactive: bool = True
    start_location: Optional[list[float]] = None


class LocationUpdateRequest(BaseModel):
    """Request body for location updates."""
    lat: float
    lng: float


class TransitionRequest(BaseModel):
    """Request body for state transitions."""
    new_status: str


class ProximityCheckRequest(BaseModel):
    """Request body for proximity checks."""
    current_location: list[float]
    poi_location: list[float]
    threshold: float = 50.0


@router.post("/tour/proximity-check")
async def proximity_check(request: ProximityCheckRequest):
    """Check if user is near a POI."""
    is_near = check_poi_proximity(
        current_location=tuple(request.current_location),
        poi_coords=tuple(request.poi_location),
        threshold_meters=request.threshold
    )
    
    return {
        "is_near": is_near,
        "threshold_meters": request.threshold
    }


@router.post("/tour/create")
async def create_tour(request: CreateTourRequest):
    """Create a new tour with the given preferences and generate route."""
    tour = tour_manager.create_tour({
        "tour_length": request.tour_length,
        "theme": request.theme,
        "sound_effects": request.sound_effects,
        "guide_personality": request.guide_personality,
        "interactive": request.interactive
    })
    
    # Default to Providence center if no start location
    start_coords = tuple(request.start_location) if request.start_location else (41.8240, -71.4128)
    tour.current_location = start_coords
    
    # Generate optimized route
    route = generate_route(
        start_coords=start_coords,
        theme=request.theme,
        time_budget_minutes=request.tour_length
    )
    tour.route = route
    
    return {
        "success": True,
        "tour_id": tour.id,
        "tour": tour.to_dict()
    }


@router.get("/tour/{tour_id}")
async def get_tour(tour_id: str):
    """Get the current state of a tour."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    
    return {"tour": tour.to_dict()}


@router.post("/tour/{tour_id}/location")
async def update_location(tour_id: str, request: LocationUpdateRequest):
    """Update user location for a tour and check POI proximity."""
    tour = tour_manager.update_location(tour_id, request.lat, request.lng)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    
    current_coords = (request.lat, request.lng)
    proximity_info = None
    directions = None
    
    if tour.route.current_stop:
        stop = tour.route.current_stop
        
        # Check proximity using Haversine
        if check_poi_proximity(current_coords, stop.coordinates, threshold_meters=50):
            proximity_info = {
                "near_poi": True,
                "poi_id": stop.id,
                "poi_name": stop.name,
                "should_transition": tour.status.value == "traveling"
            }
        else:
            # Get walking directions to current stop
            directions = get_walking_directions(current_coords, stop.coordinates)
    
    return {
        "success": True,
        "current_location": current_coords,
        "proximity": proximity_info,
        "directions": directions
    }


@router.post("/tour/{tour_id}/transition")
async def transition_state(tour_id: str, request: TransitionRequest):
    """Transition the tour to a new state."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    
    try:
        new_status = TourStatus(request.new_status)
        tour.transition_to(new_status)
        return {
            "success": True,
            "previous_status": tour.status.value,
            "new_status": new_status.value,
            "tour": tour.to_dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tour/{tour_id}/advance")
async def advance_stop(tour_id: str):
    """Advance to the next stop on the tour."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    
    if tour.route.advance():
        return {
            "success": True,
            "current_stop_index": tour.route.current_stop_index,
            "current_stop": tour.route.current_stop.name if tour.route.current_stop else None,
            "is_last_stop": tour.route.next_stop is None
        }
    else:
        return {
            "success": False,
            "message": "Already at last stop",
            "is_complete": True
        }


@router.get("/pois")
async def get_pois(theme: Optional[str] = None):
    """Get all available POIs, optionally filtered by theme."""
    pois_path = Path(__file__).parent.parent / "data" / "pois.json"
    
    try:
        with open(pois_path) as f:
            pois = json.load(f)
        
        if theme:
            pois = [poi for poi in pois if theme in poi.get("themes", [])]
        
        return {"pois": pois, "count": len(pois)}
    except FileNotFoundError:
        return {"pois": [], "count": 0, "error": "POI data not found"}


@router.delete("/tour/{tour_id}")
async def delete_tour(tour_id: str):
    """Delete a tour session."""
    if tour_manager.delete_tour(tour_id):
        return {"success": True, "message": "Tour deleted"}
    raise HTTPException(status_code=404, detail="Tour not found")
