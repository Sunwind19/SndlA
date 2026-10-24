import os
import sys
import time
import json
from dotenv import load_dotenv
from gradio_client import Client, handle_file

load_dotenv()

SPACE = os.getenv("HF_SPACE")
HF_TOKEN = os.getenv("HF_TOKEN")

def connect():
    for i in range(12):
        try:
            if HF_TOKEN:
                return Client(SPACE, hf_token=HF_TOKEN)
            return Client(SPACE)
        except Exception as e:
            print("Waiting for space...", i + 1, type(e).__name__)
            time.sleep(10)
    raise RuntimeError("Space did not wake up")

if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        print("usage: python ai_test.py test_photos/a.jpg test_photos/b.jpg")
        sys.exit(1)

    t0 = time.time()
    client = connect()
    print("connected in", round(time.time() - t0, 1), "s")

    for p in paths:
        t1 = time.time()
        result = client.predict(handle_file(p), api_name = "/reporter_analyze")
        sec = time.time() - t1
        print("\n==", p, "-", round(sec, 1), "s")
        print(json.dumps(result, indent = 2, ensure_ascii = False))
