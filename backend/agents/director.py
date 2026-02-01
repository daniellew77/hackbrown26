
"""
Tour Director Agent
Responsible for route planning and replanning based on user requests.
Uses KnowledgeService to find new POIs.
"""

from services.knowledge import KnowledgeService
from agents.base import BaseAgent
from models.state import POIStop, TourState
from typing import List, Optional

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
        - "query": what they're looking for (e.g., "coffee", "food", "bathroom")
        - "reason": brief reason (optional)
        
        Example responses:
        {{"action": "find_place", "query": "coffee shop", "reason": "user is tired"}}
        {{"action": "skip_stop", "query": null, "reason": "user not interested"}}
        
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
        places = self.knowledge_service.search_places(query, current_location, radius_meters=1000)
        return places

    async def replan_route(self, tour: TourState, user_request: str) -> dict:
        """
        Handle a replanning request.
        Returns new POI suggestions or route modifications.
        """
        # 1. Extract what user wants
        intent = await self.extract_replan_request(user_request)
        action = intent.get("action", "find_place")
        query = intent.get("query", user_request)
        
        result = {
            "success": False,
            "action": action,
            "message": "",
            "new_stops": [],
            "skipped": False
        }
        
        # 2. Handle based on action
        if action == "find_place" and query:
            # Search for nearby places
            current_loc = tour.current_location or (41.8240, -71.4128)  # Default Providence
            places = await self.find_nearby_places(query, current_loc)
            
            if places:
                result["success"] = True
                result["new_stops"] = places[:3]  # Top 3 options
                result["message"] = f"I found {len(places)} options for '{query}' nearby!"
            else:
                result["message"] = f"Sorry, I couldn't find any '{query}' nearby. Let's continue with the tour."
                
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
