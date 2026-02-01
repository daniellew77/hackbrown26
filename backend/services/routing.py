"""
Routing Service
Handles route generation and optimization for walking tours.
Uses a greedy nearest-neighbor algorithm for simplicity.
"""

import json
import math
from pathlib import Path
from typing import Optional
from models.state import POIStop, Route, TourTheme


def load_pois() -> list[dict]:
    """Load POI data from JSON file."""
    pois_path = Path(__file__).parent.parent / "data" / "pois.json"
    with open(pois_path) as f:
        return json.load(f)


def haversine_distance(coord1: tuple[float, float], coord2: tuple[float, float]) -> float:
    """Calculate distance between two coordinates in meters using Haversine formula."""
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Earth's radius in meters
    r = 6371000
    return r * c


def filter_pois_by_theme(pois: list[dict], theme: str) -> list[dict]:
    """Filter POIs to only include those matching the given theme."""
    return [poi for poi in pois if theme in poi.get("themes", [])]


def score_poi(poi: dict, theme: str) -> float:
    """Score a POI based on relevance to theme and content richness."""
    score = 1.0
    
    # Boost if theme is primary (first in list)
    if poi.get("themes") and poi["themes"][0] == theme:
        score += 1.0
    
    # Boost for more facts
    score += len(poi.get("facts", [])) * 0.1
    
    # Boost for interactive questions
    score += len(poi.get("interactive_questions", [])) * 0.2
    
    return score


def estimate_walking_time(distance_meters: float) -> float:
    """Estimate walking time in minutes (assuming 5 km/h walking speed)."""
    walking_speed_mpm = 5000 / 60  # meters per minute
    return distance_meters / walking_speed_mpm


def generate_route(
    start_coords: tuple[float, float],
    theme: str,
    time_budget_minutes: int = 60,
    max_stops: int = 8,
    end_coords: Optional[tuple[float, float]] = None,
    use_dynamic_search: bool = False
) -> Route:
    """
    Generate an optimized tour route using greedy nearest-neighbor algorithm.
    
    Args:
        start_coords: Starting location (lat, lng)
        theme: Tour theme for filtering POIs
        time_budget_minutes: Total time available for tour
        max_stops: Maximum number of stops
        end_coords: Optional destination
        use_dynamic_search: Whether to use Google Places API for finding POIs
    
    Returns:
        Route object with ordered stops
    """
    
    candidates = []

    # 1. Dynamic Search (Google Places)
    if use_dynamic_search:
        print(f"🌍 Performing dynamic tour generation for theme: '{theme}'")
        from services.knowledge import KnowledgeService
        ks = KnowledgeService()
        
        # Search radius: 2km
        places = ks.search_places(query=theme, location=start_coords, radius_meters=2000, open_now=True)
        
        # Convert to candidate format matching generic POI dict
        for p in places:
            # Filter low rated places if possible, but keep enough candidates
            if p.get("rating") and float(p["rating"]) < 3.5:
                continue
                
            candidates.append({
                "id": p["place_id"],
                "name": p["name"],
                "coordinates": p["coordinates"],
                "address": p["address"],
                "poi_type": p["types"][0] if p["types"] else "point_of_interest",
                "themes": [theme],
                "estimated_duration": 15, # Default 15 mins for dynamic stops
                "facts": [], # No pre-written facts
                "interactive_questions": []
            })
            
    # 2. Fallback / Static Data
    if not candidates:
        if use_dynamic_search:
            print("⚠️ Dynamic search yielded no results. Falling back to curated list.")
            
        # Load and filter POIs
        all_pois = load_pois()
        themed_pois = filter_pois_by_theme(all_pois, theme)
        
        if not themed_pois:
            # Fallback to all POIs if none match theme
            themed_pois = all_pois
        
        # Score and sort POIs
        scored_pois = [(poi, score_poi(poi, theme)) for poi in themed_pois]
        scored_pois.sort(key=lambda x: x[1], reverse=True)
        
        # Take top candidates
        candidates = [poi for poi, _ in scored_pois[:max_stops * 3]]
    
    
    # Greedy nearest-neighbor route construction
    route_stops = []
    current_pos = start_coords
    remaining_time = time_budget_minutes
    used_ids = set()
    
    # Limit iterations to avoid infinite loops if something goes wrong
    while candidates and len(route_stops) < max_stops and remaining_time > 10:
        # Find nearest unvisited POI
        best_poi = None
        best_distance = float('inf')
        
        for poi in candidates:
            if poi["id"] in used_ids:
                continue
            
            poi_coords = tuple(poi["coordinates"])
            distance = haversine_distance(current_pos, poi_coords)
            
            if distance < best_distance:
                best_distance = distance
                best_poi = poi
        
        if not best_poi:
            break
        
        # Check if we have time for this stop
        travel_time = estimate_walking_time(best_distance)
        stop_duration = best_poi.get("estimated_duration", 8)
        
        if travel_time + stop_duration > remaining_time:
            # Skip this POI, might find a closer one
            candidates.remove(best_poi)
            continue
        
        # Add stop to route
        poi_stop = POIStop(
            id=best_poi["id"],
            name=best_poi["name"],
            coordinates=tuple(best_poi["coordinates"]),
            address=best_poi["address"],
            poi_type=best_poi["poi_type"],
            estimated_time=stop_duration,
            themes=best_poi.get("themes", [])
        )
        route_stops.append(poi_stop)
        
        # Update state
        used_ids.add(best_poi["id"])
        current_pos = tuple(best_poi["coordinates"])
        remaining_time -= (travel_time + stop_duration)
        candidates.remove(best_poi)
    
    return Route(stops=route_stops, destination_coords=end_coords)


def get_walking_directions(
    origin: tuple[float, float],
    destination: tuple[float, float]
) -> dict:
    """
    Get walking directions between two points.
    Tries Google Directions API first, falls back to estimation.
    """
    # 1. Try Real API
    try:
        from services.knowledge import KnowledgeService
        ks = KnowledgeService()
        directions = ks.get_directions(origin, destination)
        
        if directions:
            return directions
    except Exception as e:
        print(f"Using fallback directions due to error: {e}")

    # 2. Fallback: Haversine Estimation
    distance = haversine_distance(origin, destination)
    duration = estimate_walking_time(distance)
    
    # Calculate bearing for direction
    lat1, lon1 = math.radians(origin[0]), math.radians(origin[1])
    lat2, lon2 = math.radians(destination[0]), math.radians(destination[1])
    
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    
    # Convert bearing to cardinal direction
    directions_list = ["north", "northeast", "east", "southeast", 
                  "south", "southwest", "west", "northwest"]
    index = round(bearing / 45) % 8
    cardinal = directions_list[index]
    
    return {
        "distance_meters": round(distance),
        "duration_minutes": round(duration, 1),
        "bearing": round(bearing, 1),
        "instruction": f"Walk {cardinal} for about {round(distance)} meters",
        "steps": [
            {
                "instruction": f"Head {cardinal}",
                "distance": round(distance),
                "duration": round(duration * 60)  # seconds
            }
        ],
        "overview_polyline": None # No polyline for estimation
    }


def check_poi_proximity(
    current_location: tuple[float, float],
    poi_coords: tuple[float, float],
    threshold_meters: float = 50.0
) -> bool:
    """Check if current location is within threshold of a POI."""
    distance = haversine_distance(current_location, poi_coords)
    return distance <= threshold_meters
