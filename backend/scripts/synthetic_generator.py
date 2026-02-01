
import json
import random
import os
from pathlib import Path

def generate_synthetic_data(num_qa=10, num_replan=10):
    """
    Generate synthetic test cases from pois.json.
    """
    # Current script is in backend/scripts/
    # Target file is in backend/data/
    script_dir = Path(__file__).parent
    pois_path = script_dir.parent / "data" / "pois.json"
    
    if not pois_path.exists():
        print(f"POIs file not found at {pois_path}!")
        return
    
    with open(pois_path, 'r') as f:
        pois = json.load(f)
    
    dataset = {
        "qa_tests": [],
        "replan_tests": []
    }
    
    # QA Samples
    qa_templates = [
        "What is the history of {name}?",
        "Tell me something interesting about {name}.",
        "Why is {name} famous?",
        "What can I see at {name}?",
        "Is {name} worth visiting?"
    ]
    
    for _ in range(num_qa):
        poi = random.choice(pois)
        template = random.choice(qa_templates)
        query = template.format(name=poi['name'])
        dataset["qa_tests"].append({
            "poi_name": poi['name'],
            "query": query,
            "type": "QA"
        })
        
    # Diverse Replan / Chat / Intent Samples
    diverse_queries = [
        # REPLAN: find_place (Should trigger eval)
        ("I'm hungry, find me some food.", "find_place"),
        ("I need a coffee break.", "find_place"),
        ("Find me a museum.", "find_place"),
        ("Is there a park where I can sit down?", "find_place"),
        ("Take me to a bookstore.", "find_place"),
        
        # REPLAN: skip / end (Should NOT trigger stop eval)
        ("Skip this stop.", "skip_stop"),
        ("I'm done for today.", "end_tour"),
        
        # CHAT / QUESTION (Should NOT trigger replan eval)
        ("What's the weather like?", "CHAT"),
        ("How much further is the next stop?", "CHAT"),
        ("That's a beautiful building!", "CHAT")
    ]
    
    for _ in range(num_replan):
        query_text, expected_action = random.choice(diverse_queries)
        # Starting point is random POI
        start_poi = random.choice(pois)
        dataset["replan_tests"].append({
            "current_location": start_poi.get("coordinates", [41.8268, -71.4025]),
            "query": query_text,
            "expected_action": expected_action,
            "type": "REPLAN"
        })
        
    # Create data directory if it doesn't exist
    data_dir = script_dir.parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = data_dir / "synthetic_tests.json"
    with open(output_path, "w") as f:
        json.dump(dataset, f, indent=2)
    
    print(f"Generated {num_qa} QA and {num_replan} Replan tests in {output_path}")

if __name__ == "__main__":
    generate_synthetic_data()
