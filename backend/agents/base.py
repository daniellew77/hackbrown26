
"""
Base Agent
Parent class for all AI agents.
Wraps the AIService and provides standard initialization.
"""

from services.ai import AIService
from typing import Optional

class BaseAgent:
    def __init__(self, model_name: str = "models/gemini-2.0-flash", system_instruction: Optional[str] = None):
        """
        Initialize the base agent.
        
        Args:
            model_name: The Gemini model to use (default: gemini-2.0-flash)
            system_instruction: Optional system prompt to guide behavior
        """
        # Note: AIService currently hardcodes model, but we pass parameters for future extensibility
        self.ai = AIService()
        self.model_name = model_name
        self.system_instruction = system_instruction
