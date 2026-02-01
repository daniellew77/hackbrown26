"""
Narrator Agent
Responsible for generating personalized tour narration/scripts using Gemini.
"""

from services.ai import AIService
from models.state import POIStop, UserPreferences, GuidePersonality, TourTheme

from services.knowledge import KnowledgeService
from agents.base import BaseAgent

class NarratorAgent(BaseAgent):
    # Character Personas (injected into prompts based on guide_personality)
    CHARACTER_PERSONAS = {
        'henry': "You are Henry, a warm and friendly local guide. You speak like a welcoming neighbor who loves sharing stories about their hometown. Your tone is casual, approachable, and enthusiastic.",
        'quentin': "You are Quentin, a knowledgeable professor and historian. You speak with authority and precision, weaving fascinating facts into your narrative. Your tone is scholarly yet engaging, like an expert giving a captivating lecture.",
        'drew': "You are Drew, an energetic and adventurous explorer. You speak with excitement and passion, always finding the fun and unexpected in every corner. Your tone is lively, upbeat, and encouraging.",
        'autumn': "You are Autumn, a dramatic storyteller with a flair for the evocative. You speak in rich, expressive language that brings history and legends to life. Your tone is theatrical, mysterious, and enchanting."
    }

    def _get_persona_prompt(self, personality_value: str) -> str:
        """Get the persona description for a given character ID."""
        return self.CHARACTER_PERSONAS.get(personality_value.lower(), f"You are a tour guide with a {personality_value} personality.")

    def __init__(self):
        super().__init__(
            model_name="models/gemini-2.0-flash",
            system_instruction="You are an expert tour guide narrator."
        )
        self.knowledge_service = KnowledgeService()

    async def generate_intro(self, preferences: UserPreferences) -> str:
        """Generate a welcome message used at the start of the tour."""
        
        persona = self._get_persona_prompt(preferences.guide_personality.value)
        prompt = f"""
        {persona}
        The user has chosen a {preferences.theme} themed tour of Providence, RI.
        
        Generate a brief, engaging welcome message (2-3 sentences max).
        Introduce yourself and getting them excited about the tour.
        Do not say "stop 1" or specific directions yet, just a warm welcome.
        """
        
        return await self.ai.generate_content(prompt)

    async def generate_poi_narration(self, poi: POIStop, preferences: UserPreferences, previous_poi: POIStop = None) -> str:
        """Generate the main narration script for a POI stop."""
        
        # 1. Fetch RAG Facts
        print(f"📖 Fetching RAG facts for: {poi.name}...")
        wiki_facts = self.knowledge_service.search_wikipedia(poi.name)
        if wiki_facts:
            print("✅ Found Wikipedia context")
        
        persona = self._get_persona_prompt(preferences.guide_personality.value)
        prompt = f"""
        {persona}
        The user has arrived at: {poi.name} ({poi.address}).
        This stop is part of a {preferences.theme} themed tour.
        
        Facts about this location:
        {chr(10).join(f"- {t}" for t in poi.themes)}
        
        REAL WORLD KNOWLEDGE (Use to enhance accuracy):
        {wiki_facts}
        
        Your task:
        Write a short, engaging narration script (3-4 paragraphs max) for this stop.
        Focus heavily on the '{preferences.theme}' aspect if possible.
        
        INSTRUCTION: Include ONE sound effect instruction at the start or during the most dramatic moment.
        Format it EXACTLY like this: [SFX: description of sound].
        Example: [SFX: eerie wind howling] or [SFX: busy city traffic].
        This trigger will activate the sound system.

        TTS OPTIMIZATION:
        - Expand abbreviations (e.g., write "Saint" not "St.").
        - Write numbers as words if small (e.g., "three" not "3").
        - Use punctuation to control pacing (commas for short pauses).
        - Use EMOTIONAL TAGS for character: [sigh], [whispers], [laughs], [clears throat].
        - Example: "[whispers] Can you hear that? It's the sound of history."
        
        If there are specific facts known about this place, weave them in naturally.
        End with a thought-provoking question or a transition to the next step (which involves walking).
        """
        
        return await self.ai.generate_content(prompt)

    async def generate_filler(self, context: str, preferences: UserPreferences) -> str:
        """Generate filler text/small talk while walking."""
        persona = self._get_persona_prompt(preferences.guide_personality.value)
        prompt = f"""
        {persona}
        The user is walking between stops.
        Context: {context}
        
        Say something brief (1 sentence) to keep the energy up or share a quick tidbit.
        """
        return await self.ai.generate_content(prompt)
