# SNDL_A

## What is SNDL A in one sentence?
Ever had a experience "what that is" when hiking, or walking in the park, but never getting any explanation? Ever had spotted piece of wastes in the middle of beautiful mountain? Using SndlA, you can get meaningful experience as the app guides you through the famous viewpoints, while being mountain protector yourself by taking picture of waste when you take a rest!

## What does it do?
1. **Can be used anywhere:** The app finds named trails near you from OpenStreetMap. <mark>A Yosemite demo trail (Sentinel Dome) is always available, and is most recommended when testing / reviewing the project as there are more spots.</mark>
<img width="1550" height="888" alt="image" src="https://github.com/user-attachments/assets/a78835da-adf2-4657-a5ca-72016b988ec6" />
3. **Guides the hiking journey:** Based on the user’s location, a card at the bottom shows the next spot, how far away it is, how long until the top, and how long until sunset.
4. **Explains the top viewpoints like museum docent:** At the top, the app walks user through each viewpoint (Half Dome, El Capitan, ...) in compass order, with photos and explanations. This way, hikers can get meaningful experience by actually knowing what they are seeing!
5. **Encourage users to report waste:** When users walking speed drops and stays low, the app treats it as a rest and asks you to look around and photograph any trash.
6. **AI analysis:** The photo is uploaded and analyzed in the background. By detecting type and amount of waste, app visualizes users’ positive impact by showing num of plants/animals possibly saved by taking photo.
7. **Recap:** At the end of the hike you see your distance, time, impact, and ranking in terms of saved plants and animals. 

## Screenshots and explanation
### Full Demo video
During hiking
Landing page & Choosing trails

### Screen-by-Screen explanation

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

## Programming Languages



## What did I learn



