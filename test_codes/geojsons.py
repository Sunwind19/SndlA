import json

with open("trail.json", encoding="utf-8") as f:
    trail = json.load(f)

coords = [[lon, lat] for lat, lon in trail["points"]]

geo = {
    "type": "Feature",
    "geometry": {"type": "LineString", "coordinates": coords},
    "properties": {"name": trail["name"]},
}

with open("trail.geojson", "w", encoding="utf-8") as f:
    json.dump(geo, f)
