
"""
Eval Agent
Uses LLM-as-a-judge to evaluate RAG and Replanning responses.
"""

import json
from agents.base import BaseAgent
from typing import Dict, Any

class EvalAgent(BaseAgent):
    def __init__(self):
        super().__init__()

    async def evaluate_rag(self, question: str, answer: str, context: str) -> Dict[str, Any]:
        """
        Evaluate a RAG response for Faithfulness, Answer Relevance, and Context Relevance.
        Returns a dictionary of scores (0-5).
        """
        prompt = f"""
        You are an evaluator for an AI tour guide. Your job is to score the quality of an answer based on the provided context.
        
        USER QUESTION: "{question}"
        REDUNDANT KNOWLEDGE/CONTEXT:
        {context}
        
        AI ANSWER: "{answer}"
        
        Score the following metrics on a scale of 0 to 5:
        
        1. FAITHFULNESS: Is every claim in the AI answer strictly supported by the provided context? (5 = perfectly grounded, 0 = contains major hallucinations not in context)
        2. ANSWER RELEVANCE: Does the AI answer actually address the user's specific question? (5 = perfectly addressed, 0 = completely irrelevant)
        3. CONTEXT RELEVANCE: Was the provided context actually useful and relevant to the user's question? (5 = essential, 0 = useless filler)
        
        Return your evaluation in JSON format exactly like this:
        {{
            "faithfulness": int,
            "answer_relevance": int,
            "context_relevance": int,
            "reasoning": "brief explanation of scores"
        }}
        """
        
        response_text = await self.ai.generate_content(prompt)
        try:
            # Clean up response
            content = response_text.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            return json.loads(content)
        except Exception as e:
            # Fallback for common JSON errors (like unescaped quotes in reasoning)
            print(f"Error parsing EvalAgent response: {e}")
            try:
                # Attempt to extract scores manually if JSON fails
                import re
                faith = re.search(r'"faithfulness":\s*(\d)', response_text)
                rel = re.search(r'"answer_relevance":\s*(\d)', response_text)
                ctx = re.search(r'"context_relevance":\s*(\d)', response_text)
                return {
                    "faithfulness": int(faith.group(1)) if faith else 0,
                    "answer_relevance": int(rel.group(1)) if rel else 0,
                    "context_relevance": int(ctx.group(1)) if ctx else 0,
                    "reasoning": "Extracted via regex after JSON parse failure."
                }
            except:
                return {
                    "faithfulness": 0, "answer_relevance": 0, "context_relevance": 0,
                    "reasoning": f"Failed parse: {e}"
                }

    async def evaluate_replanning(self, preference: str, suggested_stop: str, reasoning_given: str) -> Dict[str, Any]:
        """
        Evaluate if a suggested stop satisfies user constraints during replanning.
        """
        prompt = f"""
        You are an evaluator for an AI tour guide's routing logic.
        USER PREFERENCE/REQUEST: "{preference}"
        SUGGESTED STOP: "{suggested_stop}"
        AI REASONING: "{reasoning_given}"
        
        Score the following on a scale of 0 to 5:
        
        1. CONSTRAINT SATISFACTION: Does the suggested stop actually match what the user asked for? (e.g., if they asked for "cheap coffee", is this a cafe?) (5 = perfect match, 0 = irrelevant)
        
        Return your evaluation in JSON format exactly like this:
        {{
            "constraint_satisfaction": int,
            "reasoning": "brief explanation"
        }}
        """
        
        response_text = await self.ai.generate_content(prompt)
        try:
            cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
            return json.loads(cleaned_text)
        except Exception as e:
            print(f"Error parsing EvalAgent replanning response: {e}")
            return {
                "constraint_satisfaction": 0,
                "reasoning": "Failed to parse."
            }
