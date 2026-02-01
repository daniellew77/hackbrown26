"""
Tour API Routes
Endpoints for tour creation, management, and state updates.
"""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path

from models.state import TourManager, TourStatus
from services.routing import generate_route, get_walking_directions, check_poi_proximity

router = APIRouter(tags=["tour"])

from agents.narrator import NarratorAgent
from agents.qa import QAAgent
from agents.director import TourDirectorAgent
from services.voice import VoiceService
import re

# ...

def get_voice_for_tour(theme: str, personality: str) -> str:
    """Deterministically select a voice based on tour parameters."""
    personality = personality.lower()

    # Explicit Character -> Voice ID mapping (bypasses fuzzy logic)
    CHARACTER_VOICE_MAP = {
        'henry': 'TxGEqnHWrfWFTfGW9XjX',    # Josh (Friendly Local)
        'quentin': 'ErXwobaYiN019PkySvjV',  # Antoni (Professor)
        'drew': '29vD33N1CtxCmqQRPOHJ',      # Drew (Explorer)
        'autumn': 'EXAVITQu4vr4xnSDxMaL',    # Bella (Storyteller)
    }

    if personality in CHARACTER_VOICE_MAP:
        print(f"🎤 Using character voice for '{personality}'")
        return CHARACTER_VOICE_MAP[personality]

    # Fallback to theme/personality-based fuzzy logic
    theme = theme.lower()
    
    # Logic table
    if 'ghost' in theme or 'creepy' in personality:
        return voice_service.select_voice_id('female', 'ghost') # Autumn Veil for spooky/reflective
    if 'history' in theme or 'serious' in personality:
         # Use Quentin (narrator) or Jane (audiobook)
         return voice_service.select_voice_id('male', 'history') 
    if 'art' in theme:
        return voice_service.select_voice_id('female', 'art') # Autumn Veil
    if 'fun' in personality:
        return voice_service.select_voice_id('male', 'fun') # Drew!
        
    # Default
    return voice_service.select_voice_id('male', 'friendly') # Henry

tour_manager = TourManager()
narrator_agent = NarratorAgent()
qa_agent = QAAgent()
director_agent = TourDirectorAgent()
voice_service = VoiceService()


class ChatRequest(BaseModel):
    """Request body for chat interactions."""
    message: str


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
    

    # Determine if we should use dynamic search
    # Use dynamic if theme is NOT one of the standard ones, OR if explicitly requested (though currently no explicit flag in request)
    standard_themes = ["historical", "art", "ghost"]
    use_dynamic = request.theme not in standard_themes
    
    if use_dynamic:
        print(f"✨ Custom theme detected: '{request.theme}'. Using dynamic generation.")

    # Generate optimized route
    route = generate_route(
        start_coords=start_coords,
        theme=request.theme,
        time_budget_minutes=request.tour_length,
        use_dynamic_search=use_dynamic
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


@router.post("/tour/{tour_id}/narrate")
async def generate_narration(tour_id: str):
    """Generate narration for the current stop or intro."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
    
    # CASE 1: Initial Intro (Before "Start Tour")
    if tour.status == TourStatus.INITIAL:
        # Check cache for intro
        if tour.narration_progress.script_text and "Welcome" in tour.narration_progress.script_text:
             return {"narration": tour.narration_progress.script_text, "cached": True}

        intro = await narrator_agent.generate_intro(tour.preferences)
        
        # Update state
        tour.conversation_history.append({"role": "assistant", "content": intro})
        tour.narration_progress.script_text = intro
        tour.narration_progress.current_stop_id = "INTRO"
        
        return {
            "narration": intro,
            "cached": False,
            "intro": intro,
            "poi": None
        }

    # CASE 3: Tour Complete (Outro)
    if tour.status == TourStatus.COMPLETE:
        # Check cache
        if tour.narration_progress.script_text and "farewell" in tour.narration_progress.current_stop_id:
             return {"narration": tour.narration_progress.script_text, "cached": True}

        outro = await narrator_agent.generate_outro(tour.preferences)
        
        # Update state
        tour.conversation_history.append({"role": "assistant", "content": outro})
        tour.narration_progress.script_text = outro
        tour.narration_progress.current_stop_id = "farewell"
        
        return {
            "narration": outro,
            "cached": False,
            "intro": "",
            "poi": "Tour Complete"
        }

    # CASE 2: POI Narration (When arrived)
    if not tour.route.current_stop:
        raise HTTPException(status_code=400, detail="No current stop")
        
    # Check if we already have narration for this stop
    if tour.narration_progress.current_stop_id == tour.route.current_stop.id and tour.narration_progress.script_text:
        return {"narration": tour.narration_progress.script_text, "cached": True}
    
    # Generate new narration (POI only, no intro)
    narration = await narrator_agent.generate_poi_narration(
        tour.route.current_stop, 
        tour.preferences
    )
    
    # Update state
    tour.narration_progress.current_stop_id = tour.route.current_stop.id
    tour.narration_progress.script_text = narration
    tour.narration_progress.script_position = 0
    tour.conversation_history.append({"role": "assistant", "content": narration})
    
    return {
        "narration": narration,
        "cached": False,
        "intro": "",
        "poi": tour.route.current_stop.name
    }


@router.post("/tour/{tour_id}/chat")
async def chat(tour_id: str, request: ChatRequest):
    """Handle user questions or replanning requests."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")
        
    # Add user message to history
    tour.conversation_history.append({"role": "user", "content": request.message})
    
    # 1. Classify Intent
    intent = await qa_agent.classify_intent(request.message)
    print(f"🧠 User Intent: {intent}")
    
    # 2. Handle based on intent
    if "REPLAN" in intent:
        # 🗺️ Actually replan the route!
        print("🔄 Initiating replanning...")
        replan_result = await director_agent.replan_route(tour, request.message)
        
        answer = replan_result["message"]
        
        # If we found new places, format them nicely
        if replan_result.get("new_stops"):
            # Check if we already auto-updated the route
            if replan_result.get("route_updated"):
                 # Agent already set the message
                 pass
            else:
                stops_text = "\n".join([
                    f"• {p['name']} ({p.get('rating', 'N/A')}⭐) - {p.get('address', '')[:50]}"
                    for p in replan_result["new_stops"]
                ])
                answer += f"\n\nHere are some options:\n{stops_text}\n\nWould you like to visit one of these?"
        
        # Handle skip action
        if replan_result.get("skipped"):
            # Actually advance to next stop
            tour.route.advance()
            answer += f" Next up: {tour.route.current_stop.name if tour.route.current_stop else 'Tour complete!'}"
        
        return_data = {
            "reply": answer,
            "intent": "replan",
            "replan_result": replan_result,
            "history_length": len(tour.conversation_history)
        }
    else:
        # Normal Q&A
        answer = await qa_agent.answer_question(
            question=request.message,
            current_stop=tour.route.current_stop,
            preferences=tour.preferences,
            history=tour.conversation_history
        )
        return_data = {
            "reply": answer,
            "intent": "chat",
            "history_length": len(tour.conversation_history)
        }
    
    # Add assistant response to history
    tour.conversation_history.append({"role": "assistant", "content": answer})
    
    return return_data



class AudioRequest(BaseModel):
    text: str


@router.post("/tour/{tour_id}/audio")
async def generate_tour_audio(tour_id: str, request: AudioRequest):
    """Generate audio for the given text."""
    tour = tour_manager.get_tour(tour_id)
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")

    # Select dynamic voice based on tour "Character"
    voice_id = get_voice_for_tour(
        tour.preferences.theme,  # theme is already a string
        tour.preferences.guide_personality.value
    )

    # Check Cache
    import hashlib
    text_hash = hashlib.md5(f"{request.text}-{voice_id}".encode()).hexdigest()
    
    if text_hash in tour.audio_cache:
        print("✅ Cache Hit: Returning saved audio.")
        return Response(content=tour.audio_cache[text_hash], media_type="audio/mpeg")

    # Generate audio
    audio_bytes = await voice_service.generate_audio(
        request.text, 
        tour.preferences.guide_personality.value, 
        voice_id=voice_id
    )
    
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate audio")
        
    # Store in Cache
    tour.audio_cache[text_hash] = audio_bytes
    
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate audio")
        
    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.delete("/tour/{tour_id}")
async def delete_tour(tour_id: str):
    """Delete a tour session."""
    if tour_manager.delete_tour(tour_id):
        return {"success": True, "message": "Tour deleted"}
    raise HTTPException(status_code=404, detail="Tour not found")
