
import google.generativeai as genai
import os
from pathlib import Path

def get_api_key():
    # Try environment first
    api_key = os.environ.get('NEXT_GEMINI_API_KEY') or os.environ.get('GEMINI_API_KEY')
    if api_key:
        return api_key
    
    # Try loading from .env files
    env_files = [
        Path(__file__).parent / '.env',
        Path(__file__).parent.parent / '.env',
        Path(__file__).parent.parent / 'frontend' / '.env.local',
    ]
    
    for env_file in env_files:
        if env_file.exists():
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('NEXT_GEMINI_API_KEY=') or line.startswith('GEMINI_API_KEY='):
                        return line.split('=', 1)[1].strip()
    return None

api_key = get_api_key()
if not api_key:
    print("No API Key found")
else:
    genai.configure(api_key=api_key)
    print("Available models:")
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")
