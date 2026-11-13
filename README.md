

# SNDL_A

## What is SNDL A in one sentence?
Ever had a experience "what that is" when hiking, or walking in the park, but never getting any explanation? Ever had spotted piece of wastes in the middle of beautiful mountain? Using SndlA, you can get meaningful experience as the app guides you through the famous viewpoints, while being mountain protector yourself by taking picture of waste when you take a rest! I developed this web-app because as person living in an island with 80+ small mountains, mountain waste problems are really serious in my local...and only 4% of total is being collected by the government. Thus, mapping out location of waste would be first step to establish more efficient system (which I am planning to connect with biomimetic robot I am building)

## What does it do? & Screenshots

1. **Can be used anywhere:** The app finds named trails near you from OpenStreetMap. <mark>A Yosemite demo trail (Sentinel Dome) is always available, and is most recommended when testing / reviewing the project as there are more spots.</mark>
<img width="1550" height="888" alt="image" src="https://github.com/user-attachments/assets/a78835da-adf2-4657-a5ca-72016b988ec6" />

2. **Guides the hiking journey:** Based on the user’s location, a card at the bottom shows the next spot, how far away it is, how long until the top, and how long until sunset. 
<img width="994" height="286" alt="Screenshot 2026-11-14 at 5 51 12 AM" src="https://github.com/user-attachments/assets/6e4a2d37-dca8-4c47-8906-a97e15fb0b88" />

3. **Explains the top viewpoints like museum docent:** At the top, the app walks user through each viewpoint (Half Dome, El Capitan, ...) in compass order, with photos and explanations. This way, hikers can get meaningful experience by actually knowing what they are seeing!
<img width="2882" height="1602" alt="image" src="https://github.com/user-attachments/assets/76c5a6f5-2073-4a55-89f3-e54d6dc13e82" />

4. **Encourage users to report waste:** When users walking speed drops and stays low, the app treats it as a rest and asks you to look around and photograph any trash. 
<img width="1441" height="806" alt="Screenshot 2026-11-14 at 5 54 35 AM" src="https://github.com/user-attachments/assets/9e675546-4a50-4a26-9beb-19f6d1eb22dd" />

5. **AI analysis:** The photo is uploaded and analyzed in the background. By detecting type and amount of waste, app visualizes users’ positive impact by showing num of plants/animals possibly saved by taking photo. AI analysis model was self-developed using YOLO v8 in Ultralystic and incorporating model in Huggingface!
<img width="651" height="41" alt="Screenshot 2026-11-14 at 5 56 04 AM" src="https://github.com/user-attachments/assets/fd5f93b3-fae0-40d0-a838-3b2d7e0dbee0" />

6. **Recap:** At the end of the hike you see your distance, time, impact, and ranking in terms of saved plants and animals. 
<img width="1424" height="693" alt="Screenshot 2026-11-14 at 5 57 21 AM" src="https://github.com/user-attachments/assets/348fdee4-4705-48d5-8c05-a9c745686279" />

## Full Demo Video
[![SNDL_A demo](https://img.youtube.com/vi/ruFrol7PC0U/maxresdefault.jpg)](https://www.youtube.com/watch?v=ruFrol7PC0U)

## Why do we need SNDL A?

## Self developed APIs and flow structure



## File Structure
| File Name  | What's it for? |
| ------------- | ------------- |
| app.py  | 	Flask server. Serves the web app and all /api/... endpoints  |
| requirements.txt  | 	Python packages for the server (used by Render)  |
| web/index.html  | 	All web page UI UX structure  |
| web/style.css  | 	Designing and branding the webpage!   |
| web/app.js  | 	All backend and logics  |
| web/data/trail.json  | 	File for yosemite demo trail line used during testing  |
| web/data/spots.json  | 	Spots json used for testing and practicing UX writing  |
| web/img/  | 	All the images used in the web-app  |
| AI Trash & Impact Analysis Sub-Program/  | 	File for AI model running in huggingface excluding .pt trained file  |
| ai_test.py  | 	Program used to test huggingface AI model  |
| test_photos/  | 	Sample test photos for testing  |
| data_generation/  | 	OSM data used to generate trail  |
| test_codes/  | 	Codes used in order to explore and fetch data from National Park Service  |

## What did I learn



