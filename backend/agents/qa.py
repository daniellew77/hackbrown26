"""
Q&A Agent
Responsible for answering user questions about the tour and current POI.
"""

from models.state import POIStop, UserPreferences
from services.knowledge import KnowledgeService
from agents.base import BaseAgent

class QAAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.knowledge_service = KnowledgeService()

    async def classify_intent(self, message: str) -> str:
        """Determine if user wants to chat or change plans."""
        prompt = f"""
        Analyze the user's message during a walking tour.
        Message: "{message}"
        
        Classify into one of these categories:
        - "REPLAN": User wants to visit a specific place, find food/coffee, change topic, or skip the current stop.
        - "CHAT": User is asking a question, making a comment, or chatting.
        
        Return ONLY the category name (REPLAN or CHAT).
        """
        response = await self.ai.generate_content(prompt)
        return response.strip().upper()

    async def answer_question(
        self, 
        question: str, 
        current_stop: POIStop, 
        preferences: UserPreferences,
        history: list[dict]
    ) -> str:
        """Generate an answer using RAG knowledge."""
        
        # 1. Fetch External Knowledge (Wikipedia + Maps)
        # Search for knowledge about the current stop OR keywords in the question
        query = f"{current_stop.name} {question}" if current_stop else question
        wiki_info = self.knowledge_service.search_wikipedia(current_stop.name if current_stop else question)
        
        # Format conversation history
        recent_history = history[-6:] if history else []
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in recent_history])
        
        poi_context = f"At: {current_stop.name}" if current_stop else "Walking"
        
        prompt = f"""
        You are a tour guide with a {preferences.guide_personality.value} personality.
        User is at {poi_context}.
        
        REAL WORLD KNOWLEDGE:
        {wiki_info}
        
        Chat History:
        {history_text}
        
        User: "{question}"
        
        Answer naturally and concisely (1-3 sentences). Be genuine - if you don't know something, say so.
        Don't be overly enthusiastic or performative. Just be helpful.
        """
        
        return await self.ai.generate_content(prompt)
