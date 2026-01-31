#!/usr/bin/env python3
"""
Geocode POI addresses using Google Maps Geocoding API
to fix incorrect coordinates.
"""

import json
import os
import time
import requests
from pathlib import Path

# Load API key from environment or .env file
def get_api_key():
    # Try environment first
    api_key = os.environ.get('NEXT_GOOGLE_MAPS_API_KEY')
    if api_key:
        return api_key
    
    # Try loading from .env files
    env_files = [
        Path(__file__).parent.parent / '.env',
        Path(__file__).parent.parent.parent / '.env',
        Path(__file__).parent.parent.parent / 'frontend' / '.env.local',
    ]
    
    for env_file in env_files:
        if env_file.exists():
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('NEXT_GOOGLE_MAPS_API_KEY='):
                        return line.split('=', 1)[1].strip()
    
    return None


def geocode_address(address: str, api_key: str) -> tuple[float, float] | None:
    """
    Use Google Maps Geocoding API to get lat/lng from an address.
    Returns (lat, lng) tuple or None if failed.
    """
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": address,
        "key": api_key
    }
    
    try:
        response = requests.get(url, params=params)
        data = response.json()
        
        if data["status"] == "OK" and data["results"]:
            location = data["results"][0]["geometry"]["location"]
            return (location["lat"], location["lng"])
        else:
            print(f"  ❌ Geocoding failed for '{address}': {data.get('status', 'Unknown error')}")
            return None
            
    except Exception as e:
        print(f"  ❌ Error geocoding '{address}': {e}")
        return None


def main():
    # Get API key
    api_key = get_api_key()
    if not api_key:
        print("❌ No Google Maps API key found!")
        print("   Set NEXT_GOOGLE_MAPS_API_KEY environment variable or add to .env file")
        return
    
    # Load POIs
    pois_file = Path(__file__).parent / "data" / "pois.json"
    with open(pois_file, 'r') as f:
        pois = json.load(f)
    
    print(f"🌍 Geocoding {len(pois)} POI addresses...")
    print(f"   Using API key: {api_key[:10]}...")
    print()
    
    updated = 0
    for i, poi in enumerate(pois):
        address = poi.get("address", "")
        old_coords = poi.get("coordinates", [0, 0])
        
        print(f"[{i+1}/{len(pois)}] {poi['name']}")
        print(f"   Address: {address}")
        print(f"   Old coords: {old_coords}")
        
        # Geocode the address
        new_coords = geocode_address(address, api_key)
        
        if new_coords:
            poi["coordinates"] = list(new_coords)
            print(f"   ✅ New coords: {new_coords}")
            updated += 1
        else:
            print(f"   ⚠️  Keeping old coordinates")
        
        print()
        
        # Rate limiting: 50 requests per second max, be conservative
        time.sleep(0.2)
    
    # Save updated POIs
    with open(pois_file, 'w') as f:
        json.dump(pois, f, indent=4)
    
    print(f"✅ Done! Updated {updated}/{len(pois)} POI coordinates")
    print(f"   Saved to: {pois_file}")


if __name__ == "__main__":
    main()
