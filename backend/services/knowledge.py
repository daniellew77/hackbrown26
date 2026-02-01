
"""
Knowledge Service
Provides external data from Wikipedia and Google Maps to enrich AI responses.
"""

import math
import os
import requests
from typing import Optional, List, Dict

GOOGLE_MAPS_API_KEY = os.getenv("NEXT_GOOGLE_MAPS_API_KEY")

class KnowledgeService:
    def __init__(self):
        self.wiki_api_url = "https://en.wikipedia.org/w/api.php"
        self.places_api_url = "https://maps.googleapis.com/maps/api/place"
        self.maps_key = GOOGLE_MAPS_API_KEY
        
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
            response = requests.get(self.wiki_api_url, params=search_params)
            data = response.json()
            
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
            
            response = requests.get(self.wiki_api_url, params=summary_params)
            data = response.json()
            
            pages = data.get("query", {}).get("pages", {})
            for page_id, page_data in pages.items():
                if "extract" in page_data:
                    return f"Source: Wikipedia ({title})\n{page_data['extract']}"
                    
            return ""
            
        except Exception as e:
            print(f"Wikipedia API Error: {e}")
            return ""

    def search_places(self, query: str, location: tuple[float, float], radius_meters: int = 2000) -> List[Dict]:
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
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            if data.get("status") != "OK":
                print(f"Google Places API Error: {data.get('status')} - {data.get('error_message')}")
                return []
                
            results = []
            for item in data.get("results", [])[:5]: # Top 5
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
