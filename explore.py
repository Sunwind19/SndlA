import json

with open("trail_raw.json", encoding="utf-8") as f:
    data = json.load(f)

for w in data["elements"]:
    name = w["tags"].get("name", "(Untitled)")
    if "Sentinel" in name or "Pohono" in name:
        print(name, "/ ", len(w["geometry"]), "Dots / id", w["id"])

'''
Final Decision for Simulation: Sentinel Dome Trail / 44 Dots / id 80231027
Perfect as people can observe most of the hot spots (landmarks) in this single trails.
'''