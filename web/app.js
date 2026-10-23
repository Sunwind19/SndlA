const map = L.map("map").setView([37.7306, -119.5734], 14);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
}).addTo(map);


//Declaring variables
let trailPoints = [];
let myLocation = null;
let trailSpots = [];
let cum = [];
let shownViewsFor = null;
let arrivedSpots = [];
let viewSpots = [];
let docentSteps = [];
let docentIdx = -1;

//constants
const approachM = 100;
const arriveM = 40;
const leaveM = 100;
const walkKmh = 3;
let clockOffsetMs = 0;
let history = [];
const historyKeepSec = 120;

let walkMs = walkKmh / 3.6;
let resting = false;
let slowSince = null;
let restSince = null;
let restPos = null;
let pendingPhoto = null;

const restSpeedMs = 0.3;
const restHoldSec = 20;
const moveSpeedMs = 0.8;

//Loading trail from NPS data - starting with Sentinel Dome trail in Yosemite for test.
async function loadTrail() {
    const res = await fetch("/api/trail");
    const trail = await res.json();
    trailPoints = trail.points;
    buildCum();
    const line = L.polyline(trail.points, { color: "#43a047", weight: 5 }).addTo(map);
    map.fitBounds(line.getBounds());
}

//Loading spots - viewpoints, landmarks, etc. from spots.json.
async function loadSpots(){
    const response = await fetch("/api/spots")
    const spots = await response.json();

    spots.forEach(function (spot) {
        L.marker([spot.latitude, spot.longitude])
        .addTo(map)
        .bindPopup("<b>" + spot.name + "</b><br>" + spot.desc);
    });
    viewSpots = spots.filter(function (s) { return s.type === "view"; });
    console.log("view spot number:", viewSpots.length, viewSpots);
    console.log(viewSpots.map(function (v) { return v.name + " → [" + v.visibleFrom + "]"; }));
    trailSpots = spots
        .filter(function (s) { return s.type === "trail"; })
        .map(function (s) {
            s.idx = nearestIndex(s.latitude, s.longitude).index;
            return s;
        })
        .sort(function (a, b) { return a.idx - b.idx; });
    console.log(trailSpots.map(function (s) { return s.name + " → " + s.idx; }));
}

//Views when user arrives to the summit
function viewsHere(latitude, longitude) {
    return viewSpots.filter(function (v) {
        const base = trailSpots.find(function (t) { return t.name === v.visibleFrom; });
        return base && distanceM(latitude, longitude, base.latitude, base.longitude) < arriveM;
    });
}

//Display my position as cyan marker for real-time guidance. 
function onPosition(latitude, longitude){
    if (myLocation == null){
        myLocation = L.circleMarker([latitude, longitude],{
            radius: 8, color: "#0dfcd0", fillOpacity:1 
        }).addTo(map);
    }
    else{
        myLocation.setLatLng([latitude, longitude]);
    }
    recordPosition(latitude, longitude);

    const v = speedOver(30);
    console.log("speed:", v == null ? "..." : (v * 3.6).toFixed(1) + "km/h");

    if (v != null && v > 0.5) {
        walkMs = walkMs * 0.95 + v * 0.05;
        walkMs = Math.min(Math.max(walkMs, 0.6), 2.0);
    }
    updateGuide(latitude, longitude);
}


//Checking users GPS info
function startGPS(){
    if(!("geolocation" in navigator)){
        alert("This browser does not support GPS")
        return;
    }
    navigator.geolocation.watchPosition(
        function(position){
            const crds = position.coords
            console.log(crds.latitude, crds.longitude, "Accuracy(m):", crds.accuracy, "Speed:", crds.speed);
            if (crds.accuracy > 50) return; 
            onPosition(crds.latitude, crds.longitude);
        },
        function (err){
            console.log("GPS error", err.code, err.message);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
}

//Simulator to test out program
const SIM = new URLSearchParams(location.search).get("sim") === "1";
let simPaused = false;

const simMult = Number(new URLSearchParams(location.search).get("x")) || 1;
const simSpeedMs = 1.4;
let simDist = 0;

function positionAt(distM) {
    for (let i = 1; i < cum.length; i++ ) {
        if (cum[i] >= distM) {
            const seg = cum[i] - cum[i - 1];
            const f = seg == 0 ? 0 : (distM - cum[i - 1]) / seg;
            const a = trailPoints[i - 1];
            const b = trailPoints[i];
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
    }
    return trailPoints[trailPoints.length - 1];
}

function jumpToSummit() {
    const summit = trailSpots.find(function (s) { return s.name == "Summit"; });
    if (!summit) {
        console.log("Summit spot not found");
        return;
    }
    simDist = Math.max(cum[summit.idx] - 30, 0);
    console.log("Jumped to near summit");
}

function startSim() {
    const sunsetToday = SunCalc.getTimes(new Date(), trailPoints[0][0], trailPoints[0][1]).sunset;
    clockOffsetMs = sunsetToday.getTime() - 100 * 60000 - Date.now();

    setInterval(function () {
        if (!simPaused) {
            simDist = Math.min(simDist + simSpeedMs * simMult, cum[cum.length - 1]);
        }
        const p = positionAt(simDist);
        onPosition(p[0], p[1]);
    }, 1000);

    document.addEventListener ("keydown", function(e) {
        if (e.code == "Space") {
            simPaused = !simPaused
            console.log(simPaused ? "Resting":"Walking");
        }
        if (e.code == "KeyA") {
            jumpToSummit();
        }
    });
}

//Distance info
function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = function (deg) { return deg * Math.PI / 180; };

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

//Calling out function
async function init(){
    await loadTrail();
    await loadSpots();
    if(SIM){
        startSim();
    }
    else{
        startGPS();
    }
    setInterval(checkRest, 2000);
}
init();

function buildCum(){
    cum = [0];
    for (let i = 1; i < trailPoints.length; i++) {
        const a = trailPoints[i - 1];
        const b = trailPoints[i];
        cum.push(cum[i - 1] + distanceM(a[0], a[1], b[0], b[1]));
    }
}

//Guiding by calculating distance between nearest spot & user's GPS
function updateGuide(latitude, longitude){
    if (trailPoints.length === 0 || trailSpots.length === 0) return;
    if (docentIdx != -1){
        const base = docentSteps[0].spot;
        if (distanceM(latitude, longitude, base.latitude, base.longitude) > leaveM){
            endDocent();
        }
        else {
            return;
        }
    }

    const mySpot = nearestIndex(latitude, longitude);
    if (mySpot.dist > 500) {
        console.log("To far from trail");
        return;
    }

    updateTimes(mySpot.index, latitude, longitude)

    trailSpots.forEach(function (spot) {
        if (arrivedSpots.includes(spot.name)) return;
        if (spot.idx <= mySpot.index) return;   
        const distance = distanceM(latitude, longitude, spot.latitude, spot.longitude);
        //Informing the spots coming up that has type "trail" in spots.json
        if (distance < approachM) {
            arrivedSpots.push(spot.name);
            console.log("Coming up: " + spot.name + " (" + Math.round(distance) + " m) - " + spot.desc);
            }
        });
    
    //Informing spots that has type "view", where user can see it from Summit
    const views = viewsHere(latitude, longitude);
    if (views.length > 0){
        startDocent(views[0].visibleFrom, views);
        return;
    }
    const next = trailSpots.find(function (spot) { return spot.idx > mySpot.index; });

    if (!next) {
        console.log("You've been through every spot!");
        return;
    }
    const remain = Math.round(cum[next.idx] - cum[mySpot.index]);
    updateCard(next,remain)
    //console.log("Debug:", next.idx, mySpot.index, cum.length, cum[next.idx], cum[mySpot.index]);
} 

//function for direction & nearest spots
function directionDeg(lat1, lon1, lat2, lon2){
    const toRad = function (d) { return d * Math.PI / 180; };
    const toDeg = function (r) { return r * 180 / Math.PI; };

    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))- Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function compassName(deg) {
    const names = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
    return names[Math.round(deg / 45) % 8];
}

function nearestIndex(latitude, longitude) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < trailPoints.length; i++) {
        const d = distanceM(latitude, longitude, trailPoints[i][0], trailPoints[i][1]);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return { index: bestIdx, dist: bestDist };
}

function formatDist(m) {
    return m >= 1000 ? (m / 1000).toFixed(1) + "km": m + "m";
}

function setCard(distText, name, note, photoUrl) {
    document.getElementById("cardDistance").textContent = distText;
    document.getElementById("cardName").textContent = name;
    document.getElementById("cardNote").textContent = note || "";

    document.getElementById("card").classList.toggle("hasPhoto", !!photoUrl);
    const photo = document.getElementById("cardPhoto");
    if (photoUrl) {
        photo.src = photoUrl;
        photo.style.display = "block";
    }
    else {
        photo.style.display = "none";
    }
}

function updateCard(spot, remain) {
    setCard(formatDist(remain), spot.name, "", spot.photo);
}

function startDocent(baseName, views) {
    const base = trailSpots.find(function (t) { return t.name == baseName; });
    if (!base) return;

    const steps = views.map(function (v) {
        return {
            kind: "view",
            spot: v,
            deg: directionDeg(base.latitude, base.longitude, v.latitude, v.longitude),
            km: distanceM(base.latitude, base.longitude, v.latitude, v.longitude) / 1000
        };
    }).sort(function (a, b) { return a.deg - b.deg; });

    docentSteps = [{ kind: "arrive", spot: base}].concat(steps).concat([{ kind: "rest", spot: base }]);
    docentIdx = 0;
    showStep(0);
}

function showStep(i){
    const step = docentSteps[i];
    const s = step.spot; 

    if (step.kind == "arrive") {
        if (!pendingPhoto) hideRestPopup();
        setCard("You've arrived", s.name, (docentSteps.length - 2) +  " views from here", s.photo);
        map.flyTo([s.latitude, s.longitude], 16);
    }
    else if (step.kind == "rest") {
        setCard("Before you go", s.name, "Take a moment to rest", s.photo);
        map.flyTo([s.latitude, s.longitude], 16);
        showRestPopup();
    }
    else {
        hideRestPopup();
        setCard(compassName(step.deg) + " · " + step.km.toFixed(1) + " km", s.name, s.desc, s.photo);
        map.flyTo([s.latitude, s.longitude], step.km < 1 ? 16 : 14);
    }
        
    document.getElementById("prevBtn").style.display = i > 0 ? "block" : "none" ;
    document.getElementById("nextBtn").style.display = i < docentSteps.length - 1 ? "block" : "none" ;
}

function nextStep() {
    if (docentIdx < docentSteps.length - 1) {
        docentIdx++;
        showStep(docentIdx);
    }
}

function prevStep() {
    if (docentIdx > 0) {
        docentIdx--;
        showStep(docentIdx);
    }
}

function endDocent() {
    docentIdx = -1;
    docentSteps = [];
    hideRestPopup();
    document.getElementById("prevBtn").style.display = "none";
    document.getElementById("nextBtn").style.display = "none";
    if (myLocation) map.flyTo(myLocation.getLatLng(), 16);
}

function nowMs() {
    return Date.now() + clockOffsetMs;
}

function formatMin(min) {
    if (min < 1) return "< 1 min";
    if (min < 60) return "~" + Math.round(min) + " min";
    const h = Math.floor (min / 60);
    const m = Math.round (min %  60);
    return "~" + h + "h" + m + "m";
}

function trailMinsleft(meIndex) {
    const remainM = cum[cum.length - 1] - cum[meIndex];
    return remainM / walkMs / 60;
}

function sunsetMinsleft(latitude, longitude) {
    const sunset = SunCalc.getTimes(new Date(nowMs()), latitude, longitude).sunset;
    return (sunset.getTime() - nowMs()) / 60000;
}

function updateTimes (meIndex, latitude, longitude) {
    const trailMin = trailMinsleft(meIndex);
    const sunsetMin = sunsetMinsleft(latitude, longitude);

    document.getElementById("trailTime").textContent = formatMin(trailMin);

    const sunsetPill = document.getElementById("sunsetTime");
    sunsetPill.textContent = sunsetMin > 0 ? formatMin(sunsetMin): "Sunset passed";
    sunsetPill.classList.toggle("warn", trailMin > sunsetMin - 30);
}

function recordPosition(latitude, longitude) {
    const now = Date.now();
    history.push({ t: now, lat: latitude, lon: longitude });
    while (history.length > 0 && now - history[0].t > historyKeepSec * 1000) {
        history.shift();
    }
}

function speedOver(windowSec) {
    const now = Date.now();
    const recent = history.filter(function (h) { return now - h.t <= windowSec * 1000 ;});
    if (recent.length < 2) return null;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const sec = (last.t - first.t) / 1000;
    if (sec < windowSec * 0.5) return null;

    return distanceM(first.lat, first.lon, last.lat, last.lon) / sec;
}

function checkRest() {
    if (history.length == 0) return;
    const now = Date.now();
    const last = history[history.length - 1];

    let v = speedOver(10);
    if (v === null && now - last.t > 20000) v = 0;
    if (v === null) return;

    if (!resting) {
        if (v < restSpeedMs) {
            if (slowSince === null) slowSince = now;
            if (now - slowSince >= restHoldSec * 1000) {
            resting = true;
            restSince = now;
            restPos = { lat: last.lat, lon: last.lon };
            onRestStart();
            }
        }
        else {
            slowSince = null;
        }
    }
    else {
        const vNow = speedOver(8);
        if (vNow !== null && vNow > moveSpeedMs) {
            resting = false;
            slowSince = null;
            onRestEnd(now - restSince);
        }
    }
}

function onRestStart() {
    console.log("REST started at", restPos);
    if (docentIdx != -1) return;
    showRestPopup();
}

function onRestEnd(ms) {
    console.log("REST ended after", Math.round(ms / 1000), "s");
    hideRestPopup();
}

function showRestPopup() {
    document.getElementById("restPopup").style.display = "flex";
}

function hideRestPopup(){
    document.getElementById("restPopup").style.display = "none";
}

function onTrashClean() {
    console.log("Trash Button pressed.")
    hideRestPopup();
}

function openCamera() {
    document.getElementById("photoInput").click();
}

function resizeImage(file, maxSide) {
    return new Promise (function (resolve, reject) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = function() {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(function(blob){resolve(blob);},"image/jpeg", 0.8);
        };
        img.onerror = reject;
        img.src = url;
    });
}

document.getElementById("photoInput").addEventListener("change",async function(e){
    const file = e.target.files[0];
    if (!file) return;

    const blob =  await resizeImage(file, 1024);
    const here = myLocation ? myLocation.getLatLng() : null;
    pendingPhoto = {
        blob: blob,
        lat: here ? here.lat : null, 
        lon: here ? here.lng : null,
        t: Date.now()
    };
    showPhotoPreview(blob);
    e.target.value = "";
})

function showPhotoPreview(blob) {
    const photo = document.getElementById("restPhoto");
    photo.src = URL.createObjectURL(blob);
    photo.style.display = "block";
    document.getElementById("restActions").style.display = "none";
    document.getElementById("photoActions").style.display = "flex";
    console.log("Photo ready:", Math.round(blob.size / 1024), "KB", pendingPhoto);
}

function resetRestPopup() {
    const photo = document.getElementById("restPhoto");
    photo.style.display = "none";
    photo.src = "";
    document.getElementById("restActions").style.display = "flex";
    document.getElementById("photoActions").style.display = "none";
    pendingPhoto = null;
}

async function onPhotoDone() {
    if (!pendingPhoto) { hideRestPopup(); return; }
    const form = new FormData();
    form.append("photo", pendingPhoto.blob, "trash.jpg");
    form.append("lat", pendingPhoto.lat);
    form.append("lon", pendingPhoto.lon);

    const btn = document.querySelector("#photoActions .primary");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        const res = await fetch("/api/trash", { method : "POST", body : form});
        if (!res.ok) throw new Error("HTTP " + res.status);
        console.log("Saved:", await res.json());
        btn.disabled = false;
        btn.textContent = "Done";
        hideRestPopup();
    }
    catch (err) {
        console.log("Saved failed:", err);
        btn.disabled = false;
        btn.textContent = "Retry";
    }
}