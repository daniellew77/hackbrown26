# 3D City Tour Guide - Hackathon Implementation Plan

## Project Overview

Building a 3D rendering of Providence with an AI-powered, personalizable walking tour guide that uses:
- ElevenLabs TTS and STT
- RAG/live look-up
- Gemini API
- Agentic workflow
- Google Maps API for routing

**Timeline**: 12 hours

---

## Agent Architecture

### Hierarchical Agent System

We recommend a **hierarchical agent system** with clear separation of concerns:

#### 1. Tour Director Agent (Meta-level)
- **Role**: Orchestrates the entire experience, manages state transitions
- **Responsibilities**:
  - Route generation (initial planning)
  - State management (initial → traveling → POI → traveling...)
  - Deciding when to hand off to specialized agents
  - Handling route modifications ("find me food nearby")

#### 2. POI Narrator Agent (Content-level)
- **Role**: Generates and delivers location-specific content
- **Responsibilities**:
  - Creates narration based on POI + user preferences
  - Manages the storytelling flow
  - Decides when narration is "complete" for a stop

#### 3. Q&A Agent (Interrupt-level)
- **Role**: Handles user questions/interruptions
- **Responsibilities**:
  - RAG lookups for user questions
  - Quick factual responses
  - Returns control to Narrator Agent afterward

**Why this structure?** Each agent has a single, clear purpose. The Tour Director never needs to know about historical facts; the Q&A agent doesn't worry about route planning.

---

## State & Context Management

### Core State Structure

```python
# Core state structure
class TourState:
    # User Preferences (immutable after init)
    preferences = {
        'tour_length': 60,  # minutes
        'theme': 'historical',  # historical | art | ghost/spooky
        'sound_effects': True,
        'guide_personality': 'funny',  # funny | serious | etc
        'interactive': True
    }
    
    # Route Data
    route = {
        'stops': [
            {
                'id': 'stop_1',
                'coordinates': (41.8240, -71.4128),
                'address': '75 Waterman St',
                'poi_type': 'historic_building',
                'name': 'Brown University',
                'estimated_time': 10  # minutes at this stop
            },
            # ... more stops
        ],
        'current_stop_index': 0,
        'destination_coords': None  # optional end point
    }
    
    # Active State
    current_state = 'initial'  # initial | traveling | poi | complete
    current_location = (41.8240, -71.4128)
    
    # Conversation Context
    conversation_history = []  # for maintaining context
    narration_progress = {
        'current_stop_id': None,
        'script_position': 0,  # where in narration we are
        'interrupted': False
    }
    
    # Metadata for RAG
    poi_knowledge_cache = {}  # cache fetched POI data
```

### Context Management Strategy

1. **Short-term memory**: Keep last 5-10 conversation turns in `conversation_history`
2. **Long-term memory**: Store `preferences` and `route` - these persist throughout the tour
3. **RAG context**: When at a POI, fetch relevant docs and cache in `poi_knowledge_cache`
4. **Gemini context window**: 
   - Always include: current state, current POI data, user preferences
   - Conditionally include: recent conversation history, relevant cached knowledge

---

## Data Fetching Strategy

### POI Data Sources (in priority order)

#### 1. Google Places API - Primary source
```python
# Get basic info + photos
places_client.nearby_search(
    location=current_coords,
    radius=50,  # meters
    type='point_of_interest'
)

# Get detailed info
places_client.place(
    place_id=place_id,
    fields=['name', 'formatted_address', 'rating', 
            'opening_hours', 'website', 'photos']
)
```

#### 2. Wikipedia API - For historical/detailed content
```python
# Search for articles about the location
wikipedia.search(f"{poi_name} Providence Rhode Island")

# Get summary for RAG
wikipedia.summary(article_title, sentences=5)
```

#### 3. OpenStreetMap Overpass API - For geospatial queries (free!)
```python
# Find all historic buildings within radius
overpass_query = """
[out:json];
(
  node["historic"](around:100,41.8240,-71.4128);
  way["historic"](around:100,41.8240,-71.4128);
);
out body;
"""
```

#### 4. Pre-curated JSON - Your secret weapon for the hackathon
- Manually curate 10-15 "hero" POIs in Providence
- Store rich content offline (you control quality!)
- Fall back to APIs for unknown locations

### Route Generation Approach

```python
# Pseudocode for route generation
def generate_route(user_prefs, start_coords, end_coords=None):
    # 1. Get candidate POIs
    candidates = fetch_pois_nearby(start_coords, radius=2000)
    
    # 2. Filter by theme
    filtered = filter_by_theme(candidates, user_prefs['theme'])
    
    # 3. Score and rank
    scored = score_pois(filtered, user_prefs)
    
    # 4. TSP solver (or greedy nearest-neighbor for hackathon)
    route = optimize_route(
        start=start_coords,
        pois=scored[:8],  # limit to top 8
        end=end_coords,
        time_budget=user_prefs['tour_length']
    )
    
    return route
```

**Use Google Routes API** (newer than Directions API):
- Gives you walking routes between waypoints
- Can optimize waypoint order
- Provides step-by-step navigation

---

## Tech Stack Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (React/Next.js)               │
│  - 3D Map (Three.js or Mapbox GL JS)   │
│  - ElevenLabs TTS/STT integration       │
│  - Geolocation tracking                 │
└──────────────┬──────────────────────────┘
               │ WebSocket for real-time
               ▼
┌─────────────────────────────────────────┐
│  Backend (Flask/FastAPI)                │
│  - State management                     │
│  - Agent orchestration                  │
│  - Session persistence                  │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┬────────────┐
    ▼          ▼          ▼            ▼
 Gemini API  Google     Wikipedia   ElevenLabs
 (agents)    Maps/      (RAG)       (voice)
             Places
```

---

## Agentic Workflow Implementation

### Using Gemini's Function Calling

#### Tour Director Agent Tools
```python
tour_director_tools = [
    {
        'name': 'generate_route',
        'description': 'Generate a tour route based on preferences',
        'parameters': {
            'type': 'object',
            'properties': {
                'preferences': {'type': 'object'},
                'start_location': {'type': 'object'},
                'end_location': {'type': 'object'}
            }
        }
    },
    {
        'name': 'update_route',
        'description': 'Modify route (add stop, skip stop, find food)',
        'parameters': {
            'type': 'object',
            'properties': {
                'action': {'type': 'string'},
                'target_type': {'type': 'string'}
            }
        }
    },
    {
        'name': 'transition_state',
        'description': 'Move to next state (traveling/POI/complete)',
        'parameters': {
            'type': 'object',
            'properties': {
                'new_state': {'type': 'string'},
                'next_stop_id': {'type': 'string'}
            }
        }
    }
]
```

#### POI Narrator Agent Tools
```python
narrator_tools = [
    {
        'name': 'fetch_poi_context',
        'description': 'Get historical/cultural context about location',
        'parameters': {
            'type': 'object',
            'properties': {
                'poi_id': {'type': 'string'},
                'context_type': {'type': 'string'}
            }
        }
    },
    {
        'name': 'generate_narration',
        'description': 'Create narration script for current POI',
        'parameters': {
            'type': 'object',
            'properties': {
                'poi_data': {'type': 'object'},
                'user_preferences': {'type': 'object'}
            }
        }
    }
]
```

#### Q&A Agent Tools
```python
qa_tools = [
    {
        'name': 'search_knowledge_base',
        'description': 'Search for information to answer user question',
        'parameters': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string'},
                'context': {'type': 'object'}
            }
        }
    }
]
```

---

## User Flow

### 1. User Opens App
- **Landing Page**: Initialize Tour object
  - Collect preferences:
    - Length of tour (minutes)
    - Theme: historical, art, ghost/spooky
    - Sound effects? (Boolean)
    - Demeanor of tour guide (ElevenLabs characteristics: funny, serious, etc.)
    - Interactive mode? (Boolean)
  - Pull initial coordinates from device
  - Optional: Desired end location

### 2. Route Generation
- Feed preferences through model to generate route
- Add ordered graph/list representing route to Tour object
  - First element is starting location
  - Every element has street address
- Maintain global variable of current street address

### 3. Tour Execution

#### State: Initial
- Button: "Start Tour!" → creates state object
- Agent introduces itself (uses preferences to customize introduction)
- Shows first stop with visual preview
- Button: "Let's Go!"

#### State: Traveling
- Use Google Maps API for navigation instructions
- Monitor location continuously
- When location detected near next node on route → transition to POI state

#### State: POI
- Activate POI Narrator Agent
- Uses preferences + POI data to generate script (with RAG/internet lookup)
- Begin narration (TTS via ElevenLabs)
- User can interrupt:
  - **Via typing or talking** (STT via ElevenLabs)
  - Activates Q&A Agent:
    - Use RAG or live lookup to answer question
    - Continue narration from where it left off after answering
  - **Route modification requests**:
    - "Skip to next stop"
    - "Find a place to eat"
    - Update metadata and route accordingly
  - **Completion**:
    - User indicates done with POI
    - Transition back to traveling state

---

## Critical Implementation Tips for 12 Hours

### Priority 1: Core Functionality
1. **Start with 5 hardcoded POIs** - Don't rely on perfect API integration initially
2. **State machine is key** - Get the initial → traveling → POI → traveling flow working first
3. **Simplify routing** - Just use nearest-neighbor greedy algorithm, not TSP

### Priority 2: Essential Features
4. **Mock the 3D map first** - Use a simple 2D Mapbox map, add 3D later if time
5. **Pre-generate sample narrations** - Have fallbacks if Gemini is slow
6. **Use WebSockets** - So location updates are real-time without polling

### Priority 3: Polish (if time permits)
7. **Sound effects**: Pre-download 5-10 ambient sounds (footsteps, door creaks for ghost tours)
8. **Visual feedback**: Animate transitions between states
9. **Easter egg**: Add a "secret stop" that only appears if user asks the agent
10. **Interactive demo**: Have a "demo mode" with fake GPS that auto-advances

---

## Quick Wins for Demo

### Pre-loaded Assets
- **Sound effects library**: Footsteps, ambient city noise, door creaks (for ghost tours), camera clicks (for art tours)
- **Sample POI database**: 10-15 Providence locations with rich, pre-written content
- **Fallback narrations**: Generic scripts for each theme if API fails

### Visual Polish
- **Smooth state transitions**: Fade effects between traveling/POI states
- **Progress indicator**: Show which stop you're on (e.g., "Stop 3 of 7")
- **Mini-map**: Always show where you are in the route

### Demo Mode Features
- **Simulated GPS**: Auto-advance through route every 30 seconds
- **Skip animations**: Fast-forward button for judges
- **Reset button**: Quick restart for multiple demos

---

## Suggested Providence POIs for Hardcoding

### Historical Theme
1. Rhode Island State House
2. Benefit Street (historic district)
3. First Baptist Church in America
4. Providence Athenaeum
5. John Brown House Museum

### Art Theme
1. RISD Museum
2. Providence Performing Arts Center
3. WaterFire installation areas
4. AS220 (art space)
5. Gallery Night locations

### Ghost/Spooky Theme
1. Providence Athenaeum (H.P. Lovecraft connection)
2. Old State House
3. Prospect Terrace Park (night atmosphere)
4. Swan Point Cemetery
5. Benefit Street haunted houses

---

## Sample POI Data Structure

```json
{
  "id": "poi_001",
  "name": "Rhode Island State House",
  "coordinates": [41.8305, -71.4148],
  "address": "82 Smith St, Providence, RI 02903",
  "poi_type": "government_building",
  "themes": ["historical", "art"],
  "facts": [
    "Completed in 1904",
    "Fourth largest self-supported marble dome in the world",
    "Designed by McKim, Mead & White"
  ],
  "narration_hooks": {
    "historical": "This magnificent building took over 15 years to construct...",
    "art": "Notice the stunning marble dome, inspired by St. Peter's Basilica...",
    "ghost": "Some say the halls echo with footsteps of legislators past..."
  },
  "interactive_questions": [
    "Can you guess how many pieces of marble were used in the dome?",
    "What do you notice about the architectural style?"
  ],
  "estimated_duration": 8,
  "rag_sources": [
    "https://en.wikipedia.org/wiki/Rhode_Island_State_House",
    "official_website_url"
  ]
}
```

---

## API Rate Limits & Fallbacks

### Be Aware Of:
- **Google Maps API**: 40,000 requests/month free tier
- **ElevenLabs**: Check your plan's character limit
- **Gemini API**: Rate limits vary by tier
- **Wikipedia API**: No official limit but be respectful (1 request/second)

### Fallback Strategy:
1. **Cache everything**: Store API responses aggressively
2. **Offline mode**: Pre-generated content for hero POIs
3. **Graceful degradation**: If TTS fails, show text; if maps fail, use static directions
4. **Error messages**: Make them helpful ("Network slow - using cached content")

---

## Development Timeline (12 Hours)

### Hours 0-2: Setup & Core Architecture
- Set up project structure (frontend + backend)
- Implement basic state management
- Create hardcoded POI database
- Set up API keys and test connections

### Hours 2-5: State Machine & Navigation
- Build state transition logic (initial → traveling → POI)
- Integrate Google Maps for basic routing
- Implement geolocation tracking
- Test state transitions with fake GPS

### Hours 5-8: Agent Integration
- Implement Tour Director agent with Gemini
- Implement POI Narrator agent
- Implement Q&A agent
- Connect ElevenLabs TTS/STT

### Hours 8-10: Frontend & User Experience
- Build landing page with preference collection
- Create 2D map visualization (Mapbox)
- Add UI for current state display
- Implement audio playback controls

### Hours 10-11: Testing & Polish
- End-to-end testing with real walking
- Add sound effects
- Visual polish and animations
- Bug fixes

### Hour 11-12: Demo Preparation
- Create demo mode with simulated GPS
- Prepare presentation talking points
- Final bug sweep
- Record backup demo video (just in case!)

---

## Tech Stack Recommendations

### Frontend
- **Framework**: React or Next.js
- **3D/Map**: Mapbox GL JS (easier than Three.js for MVP)
- **State Management**: Zustand or React Context
- **Audio**: ElevenLabs Web SDK
- **HTTP Client**: Axios

### Backend
- **Framework**: FastAPI (async support, easy WebSockets)
- **LLM Integration**: Google Generative AI Python SDK
- **WebSocket**: FastAPI's built-in WebSocket support
- **Session Management**: Redis (or in-memory dict for hackathon)

### APIs & Services
- **LLM**: Gemini API
- **Maps**: Google Maps Platform (Places, Routes, Maps JavaScript API)
- **Voice**: ElevenLabs (TTS & STT)
- **Knowledge**: Wikipedia API, custom curated JSON
- **Geocoding**: Google Geocoding API or Nominatim (free)

---

## Success Criteria

### Must Have (MVP)
- ✅ User can input preferences
- ✅ System generates a route with 3+ stops
- ✅ State transitions work (initial → traveling → POI)
- ✅ Audio narration plays at POIs
- ✅ User can ask questions and get answers
- ✅ Basic map visualization

### Should Have
- ✅ Location tracking works in real-time
- ✅ Multiple themes available
- ✅ Interactive questions from the guide
- ✅ Sound effects for atmosphere

### Nice to Have
- ✅ 3D map visualization
- ✅ Route modification on the fly
- ✅ Multiple personality options for guide
- ✅ Photo integration from Google Places

---

## Debugging Checklist

### If location tracking isn't working:
- Check browser permissions for geolocation
- Test with fake GPS coordinates first
- Verify HTTPS (required for geolocation API)

### If agents aren't responding well:
- Check Gemini API key and quota
- Verify function calling schema matches exactly
- Add detailed logging for agent decisions
- Test with simpler prompts first

### If audio isn't playing:
- Check ElevenLabs API quota
- Verify audio format compatibility
- Test with pre-generated MP3 files first
- Check browser autoplay policies

### If maps aren't loading:
- Verify Google Maps API key
- Check API is enabled in Google Cloud Console
- Confirm billing is set up (required even for free tier)
- Test with static map image first

---

## Post-Hackathon Improvements

### Scalability
- Add database for persistent tour history
- Implement proper user authentication
- Cache POI data in Redis
- Use CDN for audio files

### Features
- Multi-city support
- User-generated tours
- Social sharing of routes
- AR markers at POIs
- Photo capture and tour album

### AI Enhancements
- Fine-tune model on Providence history
- Add multi-modal input (analyze uploaded photos)
- Personalized recommendations based on past tours
- Real-time event integration

---

## Resources & Links

### Documentation
- [Gemini API Docs](https://ai.google.dev/docs)
- [Google Maps Platform](https://developers.google.com/maps)
- [ElevenLabs API](https://elevenlabs.io/docs)
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)

### Useful Tools
- [Overpass Turbo](https://overpass-turbo.eu/) - Test OSM queries
- [Postman](https://www.postman.com/) - Test API endpoints
- [ngrok](https://ngrok.com/) - Expose localhost for mobile testing

### Inspiration
- Rick Steves audio tours
- Google Maps Live View
- Pokemon GO AR mechanics

---

## Final Tips

1. **Start simple, add complexity**: Get a working prototype in 6 hours, then enhance
2. **Test on real devices early**: Location tracking behaves differently on mobile
3. **Have offline fallbacks**: APIs will fail, be prepared
4. **Document as you go**: Future you (in 8 hours) will thank present you
5. **Sleep is debugging**: Don't skip breaks entirely
6. **Demo first impression matters**: Start your demo at a POI, not the loading screen

Good luck with your hackathon! 🚀
