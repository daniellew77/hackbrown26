
"""
Tour Director Agent
Responsible for route planning and replanning based on user requests.
Uses KnowledgeService to find new POIs.
"""

from datetime import datetime
from services.knowledge import KnowledgeService
from services.routing import haversine_distance, generate_route
from agents.base import BaseAgent
from models.state import POIStop, TourState
from agents.base import BaseAgent
from models.state import POIStop, TourState
from typing import List, Optional
from config import get_config

class TourDirectorAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.knowledge_service = KnowledgeService()

    async def extract_replan_request(self, message: str) -> dict:
        """Parse what the user wants to do."""
        prompt = f"""
        The user is on a walking tour and said: "{message}"
        
        Extract their intent. Return a JSON object with:
        - "action": one of ["find_place", "skip_stop", "end_tour", "change_theme"]
        - "auto_add": boolean (true if user specifies a specific place "add starbucks" or "pick for me", false if generic "find coffee")
        - "query": precise search keyword (e.g., "coffee shop", "modern art", "ghost stories")
        - "reason": brief reason (optional)
        
        Examples:
        - "I want coffee": {{"action": "find_place", "auto_add": false, "query": "coffee shop", "reason": "user is tired"}}
        - "Let's find a Starbucks": {{"action": "find_place", "auto_add": true, "query": "Starbucks", "reason": "specific brand"}}
        - "Skip this stop": {{"action": "skip_stop", "auto_add": false, "query": null, "reason": "not interested"}}
        - "I'm bored of history, show me art instead": {{"action": "change_theme", "auto_add": true, "query": "art galleries", "reason": "user requested theme change"}}
        - "Can we look for scary places?": {{"action": "change_theme", "auto_add": true, "query": "haunted places", "reason": "user requested theme change"}}
        
        Return ONLY the JSON, no other text.
        """
        response = await self.ai.generate_content(prompt)
        
        # Parse JSON from response
        import json
        try:
            # Clean up response
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            return json.loads(response)
        except:
            return {"action": "find_place", "query": message, "reason": "parsed from message"}

    async def find_nearby_places(self, query: str, current_location: tuple) -> List[dict]:
        """Search for places matching user's request."""
        # Enable open_now=True to ensure we don't send them to closed places
        # Increase radius to 2000m (2km) for better selection
        places = self.knowledge_service.search_places(query, current_location, radius_meters=1000, open_now=True)
        
        # Filter for quality (Rating >= 2.0)
        high_quality = [p for p in places if p.get("rating") and float(p["rating"]) >= 2.0]
        
        if high_quality:
            return high_quality
            
        return places

    def rank_candidates_by_insertion(self, tour: TourState, candidates: List[dict]) -> List[tuple[dict, int, float]]:
        """
        Rank all candidates by "Cheapest Insertion" cost.
        Returns List of (candidate, best_index, added_cost_meters), sorted by cost asc.
        """
        results = []

        # Current route stops (start checking from next stop onwards)
        stops = tour.route.stops
        start_idx = tour.route.current_stop_index + 1
        
        current_node = tour.route.current_stop
        
        for place in candidates:
            place_coords = place["coordinates"]
            best_idx = -1
            min_added_cost = float('inf')
            
            # Check all possible insertion points
            for i in range(start_idx, len(stops) + 1):
                # Determine Previous Node
                if i == 0:
                    prev_coords = tour.current_location
                else:
                    prev_coords = stops[i-1].coordinates
                    
                # Determine Next Node
                if i < len(stops):
                    next_coords = stops[i].coordinates
                else:
                    next_coords = None
                    
                dist_prev_place = haversine_distance(prev_coords, place_coords)
                
                if next_coords:
                    dist_place_next = haversine_distance(place_coords, next_coords)
                    dist_prev_next = haversine_distance(prev_coords, next_coords)
                    
                    added_cost = dist_prev_place + dist_place_next - dist_prev_next
                else:
                    added_cost = dist_prev_place
                
                # User wants to minimize distance
                total_heuristic_cost = added_cost

                if total_heuristic_cost < min_added_cost:
                    min_added_cost = total_heuristic_cost
                    best_idx = i
            
            if best_idx != -1:
                results.append((place, best_idx, min_added_cost))

        # Sort by cost (lowest added distance first)
        results.sort(key=lambda x: x[2])
        return results

    async def replan_route(self, tour: TourState, user_request: str) -> dict:
        """
        Handle a replanning request with interactive selection.
        """
        import uuid
        
        # 1. Extract what user wants
        intent = await self.extract_replan_request(user_request)
        action = intent.get("action", "find_place")
        auto_add = intent.get("auto_add", False)
        query = intent.get("query", user_request)
        
        result = {
            "success": False,
            "action": action,
            "message": "",
            "new_stops": [],
            "skipped": False,
            "route_updated": False
        }
        
        # 2. Handle based on action
        if action == "change_theme":
            # REGENERATE ROUTE
            print(f"🔄 Regenerating route for theme: {query}")
            current_loc = tour.current_location or get_config().default_start_location
            
            # Calculate remaining time
            elapsed_minutes = (datetime.now() - tour.created_at).seconds / 60
            remaining_time = max(20, tour.preferences.tour_length - int(elapsed_minutes))
            
            # Generate new route segment
            new_route_segment = generate_route(
                start_coords=current_loc,
                theme=query,
                time_budget_minutes=remaining_time,
                max_stops=5, # Slightly fewer stops for reroute
                use_dynamic_search=True
            )
            
            if new_route_segment.stops:
                # Update tour route: preserve 0..current_index, replace rest
                preserved_stops = tour.route.stops[:tour.route.current_stop_index + 1]
                tour.route.stops = preserved_stops + new_route_segment.stops
                
                # Update tour theme for future reference
                # tour.preferences.theme = query # (If theme was just a string, but it's an Enum, so strictly we might just leave it or use a custom one)
                
                result["success"] = True
                result["route_updated"] = True
                result["new_stops"] = [
                    {"name": s.name, "rating": "N/A", "address": s.address} 
                    for s in new_route_segment.stops
                ]
                
                stop_names = ", ".join([s.name for s in new_route_segment.stops[:3]])
                result["message"] = f"I've rerouted our tour to focus on '{query}'! Next up we're visiting: {stop_names}..."
            else:
                 result["message"] = f"I tried to find spots for '{query}' nearby, but came up empty. Let's stick to our current path for now."

        elif action == "find_place" and query:
            # Search for nearby places
            current_loc = tour.current_location or get_config().default_start_location
            places = await self.find_nearby_places(query, current_loc)
            
            if places:
                # Calculate costs for all options
                ranked_candidates = self.rank_candidates_by_insertion(tour, places)
                
                if not ranked_candidates:
                    result["message"] = f"I found some places, but couldn't fit them into your route."
                    return result

                # INTERACTIVE FLOW
                if auto_add:
                    # COMMIT: Auto-add the best option (Cost minimized)
                    best_place, insert_idx, cost = ranked_candidates[0]
                    
                    # Create new POI Stop
                    new_stop = POIStop(
                        id=str(uuid.uuid4()),
                        name=best_place["name"],
                        coordinates=best_place["coordinates"],
                        address=best_place.get("address", ""),
                        poi_type="added_stop",
                        estimated_time=15, # Default 15 mins
                        themes=["detour"]
                    )
                    
                    # Insert at the optimal index
                    tour.route.stops.insert(insert_idx, new_stop)
                    
                    # Determine message based on where it was inserted
                    next_stop = tour.route.stops[insert_idx + 1] if insert_idx + 1 < len(tour.route.stops) else None
                    prev_stop = tour.route.stops[insert_idx - 1] if insert_idx > 0 else None
                    
                    location_desc = "up ahead"
                    if insert_idx == tour.route.current_stop_index + 1:
                        location_desc = "as your next stop"
                    elif prev_stop:
                        location_desc = f"after {prev_stop.name}"
                        
                    result["success"] = True
                    result["new_stops"] = [best_place]
                    result["route_updated"] = True
                    result["message"] = f"I've added {best_place['name']} ({best_place.get('rating', 'N/A')}⭐) to your route! It's {location_desc}."
                    
                else:
                    # BROWSE: List top 3 options with cost
                    top_3 = ranked_candidates[:3]
                    msg_lines = [f"I found a few good places for '{query}':"]
                    
                    for i, (place, idx, cost) in enumerate(top_3):
                        rating = place.get("rating", "N/A")
                        added_dist = int(cost)
                        msg_lines.append(f"{i+1}. **{place['name']}** ({rating}⭐) - Adds +{added_dist}m walking")
                        
                    msg_lines.append("\nWhich one would you like to add? You can say 'Add the first one' or 'Go to [Name]'.")
                    
                    result["success"] = True
                    result["message"] = "\n".join(msg_lines)
                    # Note: We do NOT set route_updated=True here.
            
            else:
                result["message"] = f"Sorry, I couldn't find any open '{query}' nearby."
                
        elif action == "skip_stop":
            result["success"] = True
            result["skipped"] = True
            result["message"] = "No problem! Let's skip this stop and move to the next one."
            
        elif action == "end_tour":
            result["success"] = True
            result["message"] = "Alright, let's wrap up the tour here. Thanks for exploring with me!"
            
        else:
            result["message"] = "I'm not sure what you'd like to do. Could you be more specific?"
            
        return result

