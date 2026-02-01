import os
import requests
from dotenv import load_dotenv

load_dotenv()


# Expanded Voice Library with Metadata

# Expanded Voice Library with Metadata (Standard IDs for Free Tier)
VOICE_LIBRARY = {
    # Female Voices
    'autumn': {'id': 'pFZP5JQG7iQjIQuC4Bku', 'gender': 'female', 'style': 'emotional', 'tags': ['art', 'warm', 'reflective', 'ghost']}, # Lily

    # Male Voices
    'henry': {'id': 'TxGEqnHWrfWFTfGW9XjX', 'gender': 'male', 'style': 'soft', 'tags': ['friendly', 'soothing', 'professional']}, # Josh (Deep)
    'quentin': {'id': 'onwK4e9ZLuTAKqWW03F9', 'gender': 'male', 'style': 'well-rounded', 'tags': ['educational', 'narrator', 'history']}, # Antoni (Narrator)
    'drew': {'id': 'iP95p4xoKVk53GoZ742B', 'gender': 'male', 'style': 'energetic', 'tags': ['fun', 'romantic', 'comedy']}, # Drew (Standard)
}


ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY") or os.getenv("NEXT_ELEVENLABS_API_KEY")

class VoiceService:
    def __init__(self):
        self.api_key = ELEVENLABS_API_KEY
        if not self.api_key:
            print("⚠️ Warning: No ElevenLabs API key found. Voice features disabled.")

    def select_voice_id(self, gender: str, tone: str) -> str:
        """Select best voice ID based on constraints."""
        # Normalize inputs
        gender = gender.lower().strip()
        tone = tone.lower().strip()
        
        candidates = [v for k, v in VOICE_LIBRARY.items() if v['gender'] == gender]
        if not candidates:
            candidates = list(VOICE_LIBRARY.values())
            
        # Simple keyword matching for tone
        best_match = candidates[0]
        max_score = -1
        
        for voice in candidates:
            score = 0
            if tone in voice['style']: score += 2
            if tone in voice['tags']: score += 2
            if tone == 'spooky' and voice['style'] == 'deep': score += 1
            if tone == 'fun' and voice['style'] == 'energetic': score += 1
            
            if score > max_score:
                max_score = score
                best_match = voice
                
        return best_match['id']


    async def generate_sound_effect(self, text: str, duration_seconds: int = 4) -> bytes:
        """Generate sound effect from text description."""
        if not self.api_key:
            return None

        url = "https://api.elevenlabs.io/v1/sound-generation"
        
        headers = {
            "Content-Type": "application/json",
            "xi-api-key": self.api_key
        }
        
        data = {
            "text": text,
            "duration_seconds": duration_seconds,
            "prompt_influence": 0.5
        }

        try:
            response = requests.post(url, json=data, headers=headers)
            if response.status_code == 200:
                print(f"✅ Generated SFX: '{text}'")
                return response.content
            else:
                print(f"❌ ElevenLabs SFX Error: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"SFX Generation Failed: {e}")
            return None

    async def generate_audio(self, text: str, personality: str = 'friendly', voice_id: str = None) -> bytes:
        """Generate audio from text using ElevenLabs API. Strips [SFX] tags before TTS."""
        if not self.api_key:
            return None

        # Audio tags like [sighs], [laughs] are passed through to v3 model
        # They will be rendered as vocal expressions
        clean_text = text.strip()

        # Determine voice ID
        if not voice_id:
             # Fallback to legacy mapping if no specific ID provided
             # Map personality enum to style
             style_map = {
                 'friendly': 'soft',
                 'serious': 'strong',
                 'fun': 'energetic', 
                 'creepy': 'deep' 
             }
             # Default to female/soft if unknown
             voice_id = self.select_voice_id('female', style_map.get(personality, 'soft'))
        
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": self.api_key
        }
        
        data = {
            "text": clean_text,
            "model_id": "eleven_v3", # v3 model supports audio tags like [sighs], [laughs]
            "voice_settings": {
                "stability": 0.5,  # 'Natural' setting (Must be 0.0, 0.5, or 1.0 for v3 alpha)
                "similarity_boost": 0.75,
                # "use_speaker_boost": True # Often causes issues with alpha models
            }
        }

        try:
            response = requests.post(url, json=data, headers=headers)
            if response.status_code == 200:
                print(f"✅ Generated audio (Flash) for text: '{clean_text[:20]}...'")
                return response.content
            else:
                print(f"\n❌ ElevenLabs Error: {response.status_code} - {response.text}")
                # Fallback to Turbo v2.5 if v3 fails
                if response.status_code == 400:
                   print("⚠️ v3 model failed, retrying with Turbo v2.5...")
                   data["model_id"] = "eleven_turbo_v2_5"
                   # Remove tags from text for non-v3 models as they might read them out
                   import re
                   data["text"] = re.sub(r'\[.*?\]', '', clean_text) 
                   retry = requests.post(url, json=data, headers=headers)
                   if retry.status_code == 200:
                       return retry.content
                       
                return None
        except Exception as e:
            print(f"Voice Generation Failed: {e}")
            return None
