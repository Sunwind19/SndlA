import os
import time
import uuid
import json
import requests
import threading
from gradio_client import Client, handle_file
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
import math

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_json(path):
    with open(os.path.join(BASE_DIR, path), encoding = "utf-8") as f:
        return json.load(f)

@app.route("/")
def index():
    return send_from_directory("public", "index.html")

OSM_HEADERS = {"User-Agent": "SndlA/1.0 (https://github.com/Sunwind19/SndlA)"}
_nearby_cache = {}
_way_cache = {}

def dist_m(a, b):
    R =  6371000
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((lat2 - lat1)/2) **2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1)/2)  ** 2
    return 2 * R * math.asin(math.sqrt(h))

def line_length(points):
    return sum(dist_m(points[i-1], points[i]) for i in range(1, len(points)))

POSTPASS_URL = "https://postpass.geofabrik.de/api/interpreter"

def postpass(sql):
    try:
        r = requests.post(POSTPASS_URL, data = {"data": sql}, headers = OSM_HEADERS, timeout = 20)
    except requests.RequestException as e:
        raise RuntimeError("postpass failed: " + type(e).__name__)
    if r.status_code != 200:
        print("postpass", r.status_code, r.text[:200])
        raise RuntimeError("postpass failed: " + str(r.status_code))
    return r.json().get("features", [])

def to_points(geom):
    if not geom:
        return []
    if geom["type"] == "LineString":
        lines = [geom["coordinates"]]
    elif geom["type"] == "MultiLineString":
        lines = geom["coordinates"]
    else:
        return []
    longest = max(lines, key = len)
    return [[c[1], c[0]] for c in longest]

def near(lat, lon, deg):
    return f"ST_DWithin(geom, ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326), {deg})"

@app.route("/api/nearby")
def api_nearby():
    #Mountain routes within 3km radius from user's current location. Max 5, from closest trail.
    lat = request.args.get("lat", type = float)
    lon = request.args.get("lon", type =float)   
    if lat is None or lon is None:
        return jsonify({"error": "lat/lon required"}),400
    key = (round(lat,2)), (round(lon,2))

    #cache file by 1km
    if key in _nearby_cache:
        return jsonify(_nearby_cache[key])

    sql = f"""
    SELECT osm_id, tags->>'name' AS name, geom FROM postpass_line
    WHERE tags->>'highway' IN ('path', 'footway', 'track') AND tags ? 'name'
    AND {near(lat, lon, 0.03)}
    LIMIT 100
    """

    try:
        feats = postpass(sql)
    except RuntimeError as e:
        print(e)
        return jsonify({"error":"trail search failed"}), 502

    me = [lat, lon]
    trails, seen = [], set()

    for f in feats:
        pts = to_points(f.get("geometry"))
        if len(pts) < 5:
            continue
        length = line_length(pts)
        if length < 300 or length > 10000:
            continue
        name = f["properties"].get("name") or "Trail"
        way_id = f["properties"]["osm_id"]
        _way_cache[way_id] = {"name": name, "points": pts}
        away = min(dist_m(me, pts[0]), dist_m(me, pts[-1]))
        trails.append({"id": way_id, "name": name, "length": round(length), "away": round(away)})

    trails.sort(key = lambda t: t["away"])
    result = []
    for t in trails:
        if t["name"] in seen:
            continue
        seen.add(t["name"])
        result.append(t)
        if len(result) == 5:
            break
    _nearby_cache[key] = result
    return jsonify(result)

def get_way(way_id, lat = None, lon = None):
    if way_id in _way_cache:
        return _way_cache[way_id]
    sql = f"SELECT osm_id, tags->>'name' AS name, geom FROM postpass_line WHERE osm_id = {way_id}"
    if lat is not None and lon is not None:
        sql += " AND " + near(lat, lon, 0.1)
    feats = postpass(sql + " LIMIT 1")
    if not feats:
        return None
    f = feats[0]
    data = {"name": f["properties"].get("name") or "Trail", "points": to_points(f.get("geometry"))}
    _way_cache[way_id] = data
    return data

def osm_trail():
    trail = request.args.get("trail", "")
    if not trail.startswith("osm:"):
        return None
    try: 
        way_id = int(trail[4:])
    except ValueError:
        return None
    data = get_way(way_id)
    if not data or len(data["points"]) < 2:
        return None
    pts = data["points"]
    slat = request.args.get("slat", type = float)
    slon = request.args.get("slon", type=float)
    data = get_way(way_id, slat, slon)
    if not data or len(data["points"]) < 2:
        return None
    pts = data["points"]
    if slat is not None and slon is not None and dist_m([slat, slon], pts[-1]) < dist_m([slat, slon], pts[0]):
        pts = pts[::-1]
    return {"name": data["name"], "points": pts}

def auto_spots(pts):
    start, end = pts[0], pts[-1]
    spots = [
        {"name": "Trailhead", "type": "trail", "latitude": start[0], "longitude": start[1], "desc": ""},
        {"name": "Trail end", "type": "trail", "latitude": end[0], "longitude": end[1], "desc": ""},
    ]
    sql = f"""
    SELECT osm_id, tags->>'name' AS name, geom FROM postpass_point
    WHERE (tags->>'tourism' = 'viewpoint' OR tags->>'natural' = 'peak') AND tags ? 'name'
    AND {near(end[0], end[1], 0.03)}
    LIMIT 50
    """
    try:
        feats = postpass(sql)
    except RuntimeError:
        feats = []
    views = []
    for f in feats:
        lon, lat = f["geometry"]["coordinates"]
        here = [lat, lon]
        if dist_m(here, end) < 50:
            continue
        views.append({"name": f["properties"].get("name") or "View", "type": "view",
                      "visibleFrom": "Trail end", "latitude": lat, "longitude": lon, "desc": ""})
    views.sort(key=lambda v: dist_m([v["latitude"], v["longitude"]], end))
    return spots + views[:6]

@app.route("/api/trail")
def api_trail():
    try:
        osm = osm_trail()
    except RuntimeError:
        return jsonify({"error":"trail load failed"}), 502
    if osm:
        return jsonify(osm)
    return jsonify(load_json("data/trail.json"))

@app.route("/api/spots")
def api_spots():
    try:
        osm = osm_trail()
    except RuntimeError:
        osm = None
    if osm:
        return jsonify(auto_spots(osm["points"]))
    return jsonify(load_json("data/spots.json"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BUCKET = "trash-photos"

def sb_headers(extra = None):
    h = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
    if extra:
        h.update(extra)
    return h

@app.route("/api/trash", methods = ["POST"])
def api_trash_post():
    photo = request.files.get("photo")
    if photo is None:
        return jsonify({"error": "no photo"}), 400
    data = photo.read()
    if len(data) > 2 * 1024 * 1024:
        return jsonify({"error": "photo too large"}), 413

    lat = request.form.get("lat", type = float)
    lon = request.form.get("lon", type = float)
    device_id = request.form.get("device_id")
    name = str(int(time.time() * 1000)) + "-" + uuid.uuid4().hex[:6] + ".jpg"

    up = requests.post(
        SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + name,
        headers = sb_headers({"Content-Type": "image/jpeg"}),
        data = data, timeout = 20, #Possible error
    )

    if up.status_code >= 300:
        print("upload failed:", up.status_code, up.text)
        return jsonify({"error": "upload failed"}), 502

    photo_url = SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + name
    ins = requests.post(
        SUPABASE_URL + "/rest/v1/trash_reports",
        headers=sb_headers({"Content-Type" : "application/json", "Prefer" : "return=representation"}),
        json = {"lat" : lat, "lon" : lon, "photo_url" : photo_url, "status" : "pending", "device_id": device_id},
        timeout = 20,
    )

    if ins.status_code >= 300:
        print("insert failed:", ins.status_code, ins.text)
        return jsonify({"error":"db insert failed"}), 501

    row = ins.json()[0]
    return jsonify(row)

@app.route("/api/trash", methods = ["GET"])
def api_trash_list():
    r = requests.get(
        SUPABASE_URL + "/rest/v1/trash_reports?select=*&order=created_at.desc&limit=20",
        headers = sb_headers(), timeout = 20,
    )
    return jsonify(r.json())

HF_SPACE = os.getenv("HF_SPACE")
HF_TOKEN = os.getenv("HF_TOKEN")
_client = None
_client_lock = threading.Lock()

def get_client():
    global _client
    with _client_lock:
        if _client is None:
            _client = Client(HF_SPACE, hf_token = HF_TOKEN) if HF_TOKEN else Client(HF_SPACE)
        return _client

def reset_client():
    global _client
    with _client_lock:
        _client = None

def analyze_report(report_id, photo_url):
    result = None
    for attempt in range(2):
        try:
            result = get_client().predict(handle_file(photo_url), api_name = "/reporter_analyze")
            break
        except Exception as e:
            print("analyze failed:", attempt + 1, type(e).__name__, e)
            reset_client()
            time.sleep(5)

    body = {"status" : "done", "result" : result} if result is not None else {"status" : "error"}
    r = requests.patch(
        SUPABASE_URL + "/rest/v1/trash_reports?id=eq." + str(report_id),
        headers=sb_headers({"Content-Type": "application/json"}),
        json=body, timeout=20,
    )
    if r.status_code >= 300:
        print("update failed:", r.status_code, r.text)

def warm_space():
    for i in range(12):
        try:
            get_client()
            return
        except Exception as e:
            print("warming:", i + 1, type(e).__name__)
            reset_client()
            time.sleep(10)

@app.route("/api/warmup", methods=["POST"])
def api_warmup():
    warm_space()
    return jsonify({"ok":True})

@app.route("/api/trash/<int:report_id>", methods=["GET"])
def api_trash_one(report_id):
    r = requests.get(
        SUPABASE_URL + "/rest/v1/trash_reports?select=*&id=eq." + str(report_id),
        headers=sb_headers(), timeout=20,
    )
    rows = r.json()
    if not rows:
        return jsonify({"error" : "not found"}), 404
    return jsonify(rows[0])

RANKING = [14, 9, 6, 3, 2]

@app.route("/api/trash/<int:report_id>/analyze", methods=["POST"])
def api_trash_analyze(report_id):
    r = requests.get(
        SUPABASE_URL + "/rest/v1/trash_reports?select=photo_url,status&id=eq." + str(report_id),
        headers=sb_headers(), timeout=20,
    )
    rows = r.json() if r.status_code < 300 else []
    if not rows:
        return jsonify({"error": "not found"}), 404
    if rows[0]["status"] != "pending":
        return jsonify({"status": rows[0]["status"]})
    analyze_report(report_id, rows[0]["photo_url"])
    return jsonify({"status": "finished"})


def trash_count(result):
    if not result:
        return 0
    return sum((result.get("raw_counts")or {}).values())

@app.route("/api/rank", methods = ["GET"])

def api_rank():
    device = request.args.get("device","")
    r = requests.get( SUPABASE_URL + 
                     "/rest/v1/trash_reports?select=device_id,result&status=eq.done&device_id=not.is.null&limit=2000", 
                     headers = sb_headers(), timeout = 20) #could be source of error --> increase timeout if there's an error (avg. respond time for image recognition was 22.8s)
    rows = r.json() if r.status_code < 300 else []

    scores = {}
    for row in rows:
        d = row.get("device_id")
        scores[d] = scores.get(d, 0) + trash_count(row.get("result"))

    mine = scores.get(device)
    others = [s for d, s in scores.items() if d != device] + RANKING
    total = len(others) + 1

    if mine is None:
        return jsonify({"rank": None, "total": total, "score": 0})
    rank = 1 + sum(1 for s in others if s > mine)
    return jsonify({"rank": rank , "total": total, "score": mine})

    


if __name__ == "__main__":
    app.run(port=5001, debug=True)
