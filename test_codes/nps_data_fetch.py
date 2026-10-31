import os
import requests
from dotenv import load_dotenv
load_dotenv()
key = os.getenv("NPS_API_KEY")

res = requests.get(
    "https://developer.nps.gov/api/v1/parks",
    params={"parkCode": "yose", "api_key": key},
)
data = res.json()

park = data["data"][0]
print(park["fullName"])
print(park["latitude"], park["longitude"])


