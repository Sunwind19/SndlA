import os
import time
import uuid
import json
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

app = Flask(__name__, static_folder="web", static_url_path="")

def load_json(path):
    with open(path, encoding = "utf-8") as f:
        return json.load(f)

@app.route("/")
def index():
    return send_from_directory("web", "index.html")

@app.route("/api/trail")
def api_trail():
    return jsonify(load_json("web/data/trail.json"))

@app.route("/api/spots")
def api_spots():
    return jsonify(load_json("web/data/spots.json"))

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
        json = {"lat" : lat, "lon" : lon, "photo_url" : photo_url, "status" : "pending" },
        timeout = 20,
    )

    if ins.status_code >= 300:
        print("insert failed:", ins.status_code, ins.text)
        return jsonify({"error":"db insert failed"}), 501

    return jsonify(ins.json()[0])

@app.route("/api/trash", methods = ["GET"])
def api_trash_list():
    r = requests.get(
        SUPABASE_URL + "/rest/v1/trash_reports?select=*&order=created_at.desc&limit=20",
        headers = sb_headers(), timeout = 20,
    )
    return jsonify(r.json())


if __name__ == "__main__":
    app.run(port=5001, debug=True)
