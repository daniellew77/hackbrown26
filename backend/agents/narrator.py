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
        'henry': "You are Henry, a chill local guide. Casual tone, like talking to a friend. Don't oversell anything.",
        'quentin': "You are Quentin, a historian. Thoughtful and knowledgeable, but not preachy. Keep it conversational.",
        'drew': "You are Drew, an explorer. Upbeat when something's genuinely interesting, otherwise just helpful.",
        'autumn': "You are Autumn, a storyteller. A hint of drama when it fits, but mostly straightforward."
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
        
        VOICE DELIVERY (ElevenLabs v3 Audio Tags):
        Use these tags sparingly to add natural expression - don't overuse them:
        - [sighs], [laughs], [chuckles] - Insert at natural moments
        - [whispers] - For dramatic or intimate moments
        - [curious], [thoughtful] - Before pondering questions
        - [excited] - Only when genuinely warranted, not constantly
        Example: "[thoughtful] You know, there's something about this place..."
        
        TEXT FORMATTING:
        - Expand abbreviations (write "Saint" not "St.")
        - Write small numbers as words ("three" not "3")
        - Use ellipses (...) for natural pauses
        - Use CAPS sparingly for emphasis on key words
        
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

    async def generate_outro(self, preferences: UserPreferences) -> str:
        """Generate a farewell message when the tour is complete."""
        persona = self._get_persona_prompt(preferences.guide_personality.value)
        prompt = f"""
        {persona}
        The user has completed their {preferences.theme} tour of Providence.
        
        Generate a warm, memorable farewell message (2-3 sentences).
        - Thank them for exploring with you.
        - Encourage them to grab a bite to eat or explore more on their own.
        - Sign off in character (e.g. "Catch you on the flip side!" for Henry).
        
        Reflect the personality strongly here.
        """
        return await self.ai.generate_content(prompt)
