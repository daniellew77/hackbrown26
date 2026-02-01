
"""
Knowledge Service
Provides external data from Wikipedia and Google Maps to enrich AI responses.
"""

import math
import os
import requests
from typing import Optional, List, Dict
from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv("NEXT_GOOGLE_MAPS_API_KEY")

class KnowledgeService:
    def __init__(self):
        self.wiki_api_url = "https://en.wikipedia.org/w/api.php"
        self.places_api_url = "https://maps.googleapis.com/maps/api/place"
        self.maps_key = GOOGLE_MAPS_API_KEY
        # Wikipedia requires a User-Agent header
        self.headers = {
            "User-Agent": "HackBrown26Bot/1.0 (Student Project)"
        }
        
        if not self.maps_key:
            print("⚠️ Warning: No Google Maps API key found. RAG features will be limited.")

    def search_wikipedia(self, query: str) -> str:
        """
        Search Wikipedia for a summary of the topic.
        Returns a plain text summary or empty string.
        """
        # First, search for the page title
        search_params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json"
        }
        
        try:
            # 1. Search Query
            response = requests.get(self.wiki_api_url, params=search_params, headers=self.headers)
            try:
                data = response.json()
            except ValueError:
                print(f"Wikipedia API Error on search: status={response.status_code} text={response.text[:200]}")
                return ""
            
            if not data.get("query", {}).get("search"):
                return ""
            
            # Get best match title
            title = data["query"]["search"][0]["title"]
            
            # 2. Get Summary
            summary_params = {
                "action": "query",
                "prop": "extracts",
                "titles": title,
                "exintro": True,
                "explaintext": True,
                "format": "json"
            }
            
            response = requests.get(self.wiki_api_url, params=summary_params, headers=self.headers)
            try:
                data = response.json()
            except ValueError:
                print(f"Wikipedia API Error on summary: status={response.status_code} text={response.text[:200]}")
                return ""
            
            pages = data.get("query", {}).get("pages", {})
            for page_id, page_data in pages.items():
                if "extract" in page_data:
                    return f"Source: Wikipedia ({title})\n{page_data['extract']}"
                    
            return ""
            
        except Exception as e:
            print(f"Wikipedia API Unexpected Error: {e}")
            return ""

    def search_places(self, query: str, location: tuple[float, float], radius_meters: int = 2000, open_now: bool = False) -> List[Dict]:
        """
        Search for real places using Google Places Text Search.
        Useful for "Find me a cafe nearby" type queries.
        """
        if not self.maps_key:
            return []
            
        url = f"{self.places_api_url}/textsearch/json"
        
        params = {
            "query": query,
            "location": f"{location[0]},{location[1]}",
            "radius": radius_meters,
            "key": self.maps_key
        }
        
        if open_now:
            params["opennow"] = "true"
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if data.get("status") != "OK":
                print(f"Google Places API Error: {data.get('status')} - {data.get('error_message')}")
                return []
                
            results = []
            for item in data.get("results", [])[:40]: # Top 20
                place = {
                    "name": item.get("name"),
                    "address": item.get("formatted_address"),
                    "rating": item.get("rating"),
                    "user_ratings_total": item.get("user_ratings_total"),
                    "place_id": item.get("place_id"),
                    "types": item.get("types", []),
                    "coordinates": (
                        item["geometry"]["location"]["lat"],
                        item["geometry"]["location"]["lng"]
                    )
                }
                results.append(place)
                print(place["name"])
                
            return results
            
        except Exception as e:
            print(f"Places Search Error: {e}")
            return []

    def get_place_details(self, place_id: str) -> Dict:
        """Get details (reviews, opening hours) for a specific place."""
        if not self.maps_key:
            return {}
            
        url = f"{self.places_api_url}/details/json"
        params = {
            "place_id": place_id,
            "fields": "name,rating,formatted_phone_number,opening_hours,website,editorial_summary",
            "key": self.maps_key
        }
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            return data.get("result", {})
        except Exception as e:
            print(f"Place Details Error: {e}")
            return {}

    def get_directions(self, origin: tuple[float, float], destination: tuple[float, float]) -> Dict:
        """Get walking directions between two points using Google Directions API."""
        if not self.maps_key:
            return {}
            
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "mode": "walking",
            "key": self.maps_key
        }
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if data.get("status") != "OK":
                print(f"Directions API Error: {data.get('status')} - {data.get('error_message')}")
                return {}
                
            route = data["routes"][0]
            leg = route["legs"][0]
            
            return {
                "distance_meters": leg["distance"]["value"],
                "duration_minutes": math.ceil(leg["duration"]["value"] / 60),
                "summary": route["summary"],
                "steps": [
                    {
                        "instruction": step["html_instructions"],
                        "distance": step["distance"]["value"],
                        "duration": step["duration"]["value"],
                        "maneuver": step.get("maneuver")
                    }
                    for step in leg["steps"]
                ],
                "overview_polyline": route["overview_polyline"]["points"]
            }
            
        except Exception as e:
            print(f"Directions API Exception: {e}")
            return {}
