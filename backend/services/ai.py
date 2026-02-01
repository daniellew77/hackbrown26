"""
AI Service wrapper for Google Gemini API.
Handles client initialization and prompt transmission.
"""

import os
import google.generativeai as genai
from pathlib import Path

def get_api_key():
    # Try environment first
    api_key = os.environ.get('NEXT_GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY')
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
                    if line.startswith('NEXT_GEMINI_API_KEY=') or line.startswith('GEMINI_API_KEY='):
                        return line.split('=', 1)[1].strip()
    
    return None

class AIService:
    def __init__(self):
        self.api_key = get_api_key()
        if not self.api_key:
            print("⚠️ Warning: No Gemini API key found. AI features will be disabled.")
            self.model = None
            return
            
        genai.configure(api_key=self.api_key)
        # Use updated model name from available list
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        
    async def generate_content(self, prompt: str) -> str:
        """Generate text content from a prompt."""
        if not self.model:
            return "AI service unavailable. Please check API key configuration."
            
        try:
            response = await self.model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            print(f"Error generating content: {e}")
            return "I'm having trouble connecting to my creative circuits right now."
