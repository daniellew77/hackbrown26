"""
Tour State Management
Defines the core state structure for tours and the TourManager for session handling.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from datetime import datetime
import uuid



class TourTheme:
    HISTORICAL = "historical"
    ART = "art"
    GHOST = "ghost"


class GuidePersonality(str, Enum):
    FUNNY = "funny"
    SERIOUS = "serious"
    DRAMATIC = "dramatic"
    FRIENDLY = "friendly"


class TourStatus(str, Enum):
    INITIAL = "initial"
    TRAVELING = "traveling"
    POI = "poi"
    COMPLETE = "complete"


@dataclass
class UserPreferences:
    """User's tour preferences."""
    tour_length: int = 60  # minutes
    theme: str = TourTheme.HISTORICAL
    sound_effects: bool = True
    guide_personality: GuidePersonality = GuidePersonality.FRIENDLY
    interactive: bool = True


@dataclass
class POIStop:
    """A point of interest on the tour route."""
    id: str
    name: str
    coordinates: tuple[float, float]  # (lat, lng)
    address: str
    poi_type: str
    estimated_time: int = 8  # minutes at this stop
    themes: list[str] = field(default_factory=list)


@dataclass
class Route:
    """Tour route with stops."""
    stops: list[POIStop] = field(default_factory=list)
    current_stop_index: int = 0
    destination_coords: Optional[tuple[float, float]] = None

    @property
    def current_stop(self) -> Optional[POIStop]:
        if 0 <= self.current_stop_index < len(self.stops):
            return self.stops[self.current_stop_index]
        return None

    @property
    def next_stop(self) -> Optional[POIStop]:
        next_idx = self.current_stop_index + 1
        if next_idx < len(self.stops):
            return self.stops[next_idx]
        return None

    def advance(self) -> bool:
        """Move to next stop. Returns False if tour is complete."""
        if self.current_stop_index < len(self.stops) - 1:
            self.current_stop_index += 1
            return True
        return False


@dataclass
class NarrationProgress:
    """Tracks narration state for current POI."""
    current_stop_id: Optional[str] = None
    script_position: int = 0
    interrupted: bool = False
    script_text: str = ""


@dataclass
class TourState:
    """Complete tour state."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=datetime.now)
    
    # User preferences
    preferences: UserPreferences = field(default_factory=UserPreferences)
    
    # Route data
    route: Route = field(default_factory=Route)
    
    # Current state
    status: TourStatus = TourStatus.INITIAL
    current_location: Optional[tuple[float, float]] = None
    
    # Conversation context
    conversation_history: list[dict] = field(default_factory=list)
    
    # Narration tracking
    narration_progress: NarrationProgress = field(default_factory=NarrationProgress)
    
    # POI knowledge cache
    poi_knowledge_cache: dict = field(default_factory=dict)
    
    # Audio cache to save credits (text_hash -> bytes)
    audio_cache: dict[str, bytes] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Serialize state to dictionary."""
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat(),
            "preferences": {
                "tour_length": self.preferences.tour_length,
                "theme": self.preferences.theme,
                "sound_effects": self.preferences.sound_effects,
                "guide_personality": self.preferences.guide_personality.value,
                "interactive": self.preferences.interactive
            },
            "route": {
                "stops": [
                    {
                        "id": stop.id,
                        "name": stop.name,
                        "coordinates": stop.coordinates,
                        "address": stop.address,
                        "poi_type": stop.poi_type,
                        "estimated_time": stop.estimated_time,
                        "themes": stop.themes
                    }
                    for stop in self.route.stops
                ],
                "current_stop_index": self.route.current_stop_index
            },
            "status": self.status.value,
            "current_location": self.current_location,
            "current_stop": self.route.current_stop.name if self.route.current_stop else None
        }

    def transition_to(self, new_status: TourStatus) -> None:
        """Transition to a new tour status."""
        valid_transitions = {
            TourStatus.INITIAL: [TourStatus.TRAVELING],
            TourStatus.TRAVELING: [TourStatus.POI, TourStatus.COMPLETE],
            TourStatus.POI: [TourStatus.TRAVELING, TourStatus.COMPLETE],
            TourStatus.COMPLETE: []
        }
        
        if new_status in valid_transitions.get(self.status, []):
            self.status = new_status
        else:
            raise ValueError(f"Invalid transition from {self.status} to {new_status}")


class TourManager:
    """Manages active tour sessions."""
    
    def __init__(self):
        self.tours: dict[str, TourState] = {}

    def create_tour(self, preferences: dict) -> TourState:
        """Create a new tour with given preferences."""
        user_prefs = UserPreferences(
            tour_length=preferences.get("tour_length", 60),
            theme=preferences.get("theme", "historical"),  # Allow string
            sound_effects=preferences.get("sound_effects", True),
            guide_personality=GuidePersonality(preferences.get("guide_personality", "friendly")),
            interactive=preferences.get("interactive", True)
        )
        
        tour = TourState(preferences=user_prefs)
        self.tours[tour.id] = tour
        return tour

    def get_tour(self, tour_id: str) -> Optional[TourState]:
        """Retrieve a tour by ID."""
        return self.tours.get(tour_id)

    def update_location(self, tour_id: str, lat: float, lng: float) -> Optional[TourState]:
        """Update tour location and check for POI proximity."""
        tour = self.get_tour(tour_id)
        if tour:
            tour.current_location = (lat, lng)
        return tour

    def delete_tour(self, tour_id: str) -> bool:
        """Remove a tour session."""
        if tour_id in self.tours:
            del self.tours[tour_id]
            return True
        return False
