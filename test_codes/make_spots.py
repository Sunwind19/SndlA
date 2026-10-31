import json

with open("trail.json", encoding="utf-8") as f:
    trail = json.load(f)

points = trail["points"]
spots = [
    {"name": "Start point", "latitude": points[0][0], "longitude": points[0][1], "desc": "Beginning of the trail"},
    {"name": "Midpoint", "latitude": points[len(points) // 2][0], "lon": points[len(points) // 2][1], "desc": "Bedrocks coming up"},
    {"name": "Summit", "latitude": points[-1][0], "longitude": points[-1][1], "desc": "360-degree view"},
]

with open("web/data/spots.json", "w", encoding="utf-8") as f:
    json.dump(spots, f, ensure_ascii=False, indent=2)

print("Spot", len(spots), "Saved")