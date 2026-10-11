import json
import requests

query = """
[out:json][timeout:25];
way["highway"~"path|footway"](around:2000,37.7306,-119.5734);
out geom;
"""

res = requests.post(
    "https://overpass-api.de/api/interpreter",
    data={"data": query},
    headers={"User-Agent": "SndlA-hackathon-project"},
)

print(res.status_code)
print(res.text[:300])

data = res.json()

with open("trail_raw.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Saved, Number of trails:", len(data["elements"]))