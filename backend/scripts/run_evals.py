
import asyncio
import json
import os
import sys
import random
from pathlib import Path

# Add backend to path so we can import agents
sys.path.append(str(Path(__file__).parent.parent))

from agents.qa import QAAgent
from agents.eval import EvalAgent
from agents.director import TourDirectorAgent
from services.routing import haversine_distance
from models.state import POIStop, UserPreferences, GuidePersonality

def calculate_overhead(current_loc, next_stop_loc, suggested_loc):
    """
    Calculate additional distance added by a detour.
    Overhead = (Dist to Suggested + Dist from Suggested to Next) - (Direct Dist to Next)
    """
    d1 = haversine_distance(current_loc, suggested_loc)
    d2 = haversine_distance(suggested_loc, next_stop_loc)
    d_direct = haversine_distance(current_loc, next_stop_loc)
    return max(0, d1 + d2 - d_direct)

async def run_qa_evals(qa_agent, eval_agent, test_cases):
    print(f"\n--- Running {len(test_cases)} QA Evaluations ---")
    results = []
    
    # Mock preferences
    prefs = UserPreferences(guide_personality=GuidePersonality.FRIENDLY)
    
    for i, test in enumerate(test_cases):
        print(f"[{i+1}/{len(test_cases)}] Testing: {test['query']}")
        
        # Mock current stop
        current_stop = POIStop(
            id=f"test_{i}",
            name=test['poi_name'],
            coordinates=[0, 0], # Not used for wiki search
            address="Test Address",
            poi_type="historical",
            themes=[]
        )
        
        # 1. Get Answer from QAAgent
        answer, context = await qa_agent.answer_question(test['query'], current_stop, prefs, [])
        
        # 2. Evaluate with EvalAgent
        eval_result = await eval_agent.evaluate_rag(test['query'], answer, context)
        
        results.append({
            "test": test,
            "answer": answer,
            "evaluation": eval_result
        })
        
    return results

async def run_replan_evals(eval_agent, director_agent, test_cases):
    print(f"\n--- Running {len(test_cases)} Intent & Replanning Evaluations ---")
    
    from services.routing import load_pois
    pois = load_pois()
    
    results = []
    for test in test_cases:
        query = test['query']
        print(f"Testing Intent: {query}")
        
        # 1. Classify Intent using DirectorAgent
        intent = await director_agent.extract_replan_request(query)
        action = intent.get("action")
        
        eval_data = {
            "test": test,
            "detected_action": action,
            "evaluation": None
        }
        
        # 2. Only run Stop/Route Evaluation if it's a "find_place" or "change_theme" (i.e. new stop)
        if action in ["find_place", "change_theme"]:
            # Use real director search to find candidates
            candidates = await director_agent.find_nearby_places(intent.get("query") or query, test['current_location'])
            
            if candidates:
                # Pick the top candidate (the one the system would likely suggest)
                suggested_poi = candidates[0]
                
                # Pick another random POI as a placeholder for the 'next stop' for overhead calculation
                next_stop_poi = random.choice(pois)
                
                current_loc = test['current_location']
                suggested_loc = suggested_poi['coordinates']
                next_stop_loc = next_stop_poi['coordinates']
                
                overhead = calculate_overhead(current_loc, next_stop_loc, suggested_loc)
                mock_reasoning = f"Suggested {suggested_poi['name']} because it matches your request."
                
                eval_result = await eval_agent.evaluate_replanning(
                    query, 
                    suggested_poi['name'], 
                    mock_reasoning
                )
                
                eval_data["suggestion"] = suggested_poi['name']
                eval_data["overhead_meters"] = round(overhead, 1)
                eval_data["evaluation"] = eval_result
            else:
                print(f"  -> No candidates found for '{query}'. Satisfaction will be 0.")
                eval_data["evaluation"] = {"constraint_satisfaction": 0, "reasoning": "No candidates found."}
        else:
            print(f"  -> Action '{action}' does not trigger new stop evaluation.")
        
        results.append(eval_data)
        
    return results

async def main():
    # 1. Ensure synthetic data exists
    script_dir = Path(__file__).parent
    tests_path = script_dir.parent / "data" / "synthetic_tests.json"
    
    if not tests_path.exists():
        print("Generating synthetic tests...")
        from scripts.synthetic_generator import generate_synthetic_data
        generate_synthetic_data(num_qa=5, num_replan=3)
    
    with open(tests_path, "r") as f:
        tests = json.load(f)
        
    qa_agent = QAAgent()
    eval_agent = EvalAgent()
    director_agent = TourDirectorAgent()
    
    qa_results = await run_qa_evals(qa_agent, eval_agent, tests["qa_tests"])
    replan_results = await run_replan_evals(eval_agent, director_agent, tests["replan_tests"])
    
    # Summary Report
    print("\n" + "="*40)
    print("EVALUATION REPORT")
    print("="*40)
    
    avg_faith = sum(r["evaluation"]["faithfulness"] for r in qa_results) / len(qa_results)
    avg_relevance = sum(r["evaluation"]["answer_relevance"] for r in qa_results) / len(qa_results)
    
    print(f"Average QA Faithfulness: {avg_faith:.2f}/5")
    print(f"Average QA Relevance: {avg_relevance:.2f}/5")
    
    # Intent Accuracy
    correct_intents = sum(1 for r in replan_results if r["detected_action"] == r["test"]["expected_action"])
    intent_accuracy = (correct_intents / len(replan_results)) * 100
    print(f"Intent Classification Accuracy: {intent_accuracy:.1f}%")
    
    # Satisfaction (only for true-positive replan requests)
    replan_scores = [
        r["evaluation"]["constraint_satisfaction"] 
        for r in replan_results 
        if r["evaluation"] and r["detected_action"] == r["test"]["expected_action"]
    ]
    avg_replan = 0
    if replan_scores:
        avg_replan = sum(replan_scores) / len(replan_scores)
    
    print(f"Average Replanning Satisfaction: {avg_replan:.2f}/5 (evaluated on {len(replan_scores)} successful detours)")
    
    # Save results
    report_path = script_dir.parent / "data" / "eval_report.json"
    with open(report_path, "w") as f:
        json.dump({"qa": qa_results, "replan": replan_results}, f, indent=2)
    print(f"\nDetailed results saved to {report_path}")

if __name__ == "__main__":
    asyncio.run(main())
