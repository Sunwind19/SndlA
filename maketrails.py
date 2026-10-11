import json
with open("trail_raw.json", encoding="utf-8") as f:
    data = json.load(f)

#ID of Sentinel Dome Trail
target_id = 80231027

chosen = None
for w in data["elements"]:
    if w["id"] == target_id:
        chosen = w

points = []
for p in chosen["geometry"]:
    points.append([p["lat"], p["lon"]])

trail = {
    "name": chosen["tags"].get("name", "Trail"),
    "points": points,
}

with open("trail.json", "w", encoding="utf-8") as f:
    json.dump(trail, f, ensure_ascii=False)

print(trail["name"], "Number of Dots:", len(points))
print("Start:", points[0], "End:", points[-1])