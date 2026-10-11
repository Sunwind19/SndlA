import json

with open("trail_raw.json", encoding="utf-8") as f:
    data = json.load(f)

for w in data["elements"]:
    name = w["tags"].get("name", "(이름 없음)")
    if "Sentinel" in name or "Pohono" in name:
        print(name, "/ 점", len(w["geometry"]), "개 / id", w["id"])
'''
import json

with open("trail_raw.json", encoding="utf-8") as f:
    data = json.load(f)

for w in data["elements"]:
    name = w["tags"].get("name", "(Untitled)")
    print(name, "/", len(w["geometry"]), "Dots / id", w["id"])
'''