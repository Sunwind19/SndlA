import json
from flask import Flask, jsonify, send_from_directory

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

if __name__ == "__main__":
    app.run(port=5001, debug=True)
