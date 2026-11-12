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
let analysisResults =[];
let lastWarm = 0;

const restSpeedMs = 0.3;
const restHoldSec = 20;
const moveSpeedMs = 0.8;

const STATS_KEY = "sndla_stats";
const DEVICE_KEY = "sndla_device";
let stats = loadStats();
let deviceID = getdeviceID();
let rankInfo = { rank : null, total : null };
let pendingReports = 0;

const NICK_KEY = "sndla_nick";
const HIKE_KEY = "sndla_hike_" + (TRAIL || "yose");
let hike = loadHike();
let phase = hike.phase;
let nickname = loadNickname();
let finishReady = false;

const params = new URLSearchParams(location.search);
const TRAIL = params.get("trail") || "";
const START_LAT = params.get("slat");
const START_LON = params.get("slon");


// Trail to ask to server
function trailQuery() {
    if (TRAIL.startsWith("osm:")) {
        return "?trail=" + encodeURIComponent(TRAIL) + "&slat=" + START_LAT + "&slon=" + START_LON;
    }
    return "";      
}

//Loading trail from NPS data - starting with Sentinel Dome trail in Yosemite for test.
async function loadTrail() {
    const res = await fetch("/api/trail");
    const trail = await res.json();
    trailPoints = trail.points;
    buildCum();
    const line = L.polyline(trail.points, { color: "#43a047", weight: 5 }).addTo(map);
    map.fitBounds(line.getBounds());
    return true;
}
async function loadSpots(){
    const response = await fetch("/api/spots" + trailQuery());
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
    console.log("ㄴㄴspeed:", v == null ? "..." : (v * 3.6).toFixed(1) + "km/h");

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
let simDir = 1;


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
            simDist = Math.min(Math.max(simDist + simDir * simSpeedMs * simMult, 0), cum[cum.length-1]);
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
        if (e.code == "KeyD") {
            simDir = -simDir;
            console.log(simDir > 0 ? "Going up":"Going down");
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
    if (!SIM && !TRAIL) {      
        openPicker();
        return;
    }
    if (new URLSearchParams(location.search).get("reset") == "1")
    resetStats();
    renderStats();
    refreshRank();
    await loadTrail();
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
        trackingProcess(mySpot)
        console.log("To far from trail");
        return;
    }

    updateTimes(mySpot.index, latitude, longitude)
    if (phase == "down") {
        updateDescent(latitude, longitude, mySpot);
        return;
    }

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
    const endSpot = trailSpots[trailSpots.length - 1];          // 트레일 위 마지막 스팟 = 정상(끝점)
    const views = viewsHere(latitude, longitude);
    const atEnd = distanceM(latitude, longitude, endSpot.latitude, endSpot.longitude) < arriveM;
    if (phase == "up" && (views.length > 0 || atEnd)) {
        startDocent(endSpot.name, views);
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

function updateDescent(latitude, longitude, mySpot){
    const startSpot = trailSpots[0];
    const start = trailPoints[0];
    const toStart = distanceM(latitude, longitude, start[0], start[1]);
    const btn = document.getElementById("finishBtn");

    if (finishReady) {
        if (toStart  > leaveM) {
            finishReady = false;
            hike.endAt = null;
            saveHike();
            btn.style.display = "none"
        }
        else {
            return;
        }
    }
    if (toStart < arriveM) {
        finishReady = true;
        if (!hike.endAt) {
            hike.endAt = Date.now();
            saveHike();
        }
        setCard("You're back", startSpot.name, "Nice hike! See your summary", startSpot.photo);
        btn.style.display = "block";
        return;
    }
    setCard(formatDist(Math.round(cum[mySpot.index])),
    startSpot.name, "Heading back down", startSpot.photo);

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
    phase = "down";
    hike.phase = "down";
    saveHike();

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
        const n = docentSteps.length - 2;      
        setCard("You've arrived", s.name, n > 0 ? n + " views from here" : "Take a look around", s.photo);
        map.flyTo([s.latitude, s.longitude], 16);
    }
    else if (step.kind == "rest") {
        setCard("Before you go", s.name, "Take a moment to rest", s.photo);
        map.flyTo([s.latitude, s.longitude], 16);
        showRestPopup();
    }
    else if (step.kind == "finish") {
        hideRestPopup();
        setCard("That's the summit!", s.name, "Ready to wrap up?", s.photo);
    }
    else {
        hideRestPopup();
        setCard(compassName(step.deg) + " · " + step.km.toFixed(1) + " km", s.name, s.desc, s.photo);
        map.flyTo([s.latitude, s.longitude], step.km < 1 ? 16 : 14);
    }
        
    document.getElementById("prevBtn").style.display = i > 0 ? "block" : "none" ;
    document.getElementById("nextBtn").style.display = i < docentSteps.length - 1 ? "block" : "none" ;
    document.getElementById("finishBtn").style.display = "none";
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
    const remainM = phase = "down" ? cum[meIndex] : cum[cum.length - 1] - cum[meIndex];
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
    warmSpace();
    console.log("REST started at", restPos);
    if (docentIdx != -1) return;
    showRestPopup();
}

function onRestEnd(ms) {
    console.log("REST ended after", Math.round(ms / 1000), "s");
    if (!pendingPhoto) hideRestPopup();
}

function showRestPopup() {
    document.getElementById("restPopup").style.display = "flex";
}

function hideRestPopup(){
    document.getElementById("restPopup").style.display = "none";
    resetRestPopup()
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
    form.append("device_id", deviceId);

    const btn = document.querySelector("#photoActions .primary");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        const res = await fetch("/api/trash", { method : "POST", body : form});
        if (!res.ok) throw new Error("HTTP " + res.status);
        const saved= await res.json();
        console.log("Saved:", saved);
        trackReport(saved.id);
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

async function pollReport(id) {
    for (let i = 0; i < 30; i++) {
        await new Promise(function (r) {setTimeout(r, 3000); });
        try {
            const res = await fetch("/api/trash/" + id);
            if (!res.ok) continue;
            const row = await res.json();
            if (row.status == "done") {
                console.log("AI result:", row.result);
                analysisResults.push(row.result);
                addResults(row.result)
                return;
            }
            if (row.status === "error") {
                console.log("AI failed for report", id);
                return;
            }
        }
        catch(err) {
            console.log("poll error", err);
        }
    }
    console.log("AI failed for report", id)
}

function warmSpace() {
    if (Date.now() - lastWarm < 10 * 60 * 1000) return;
    lastWarm = Date.now();
    fetch("/api/warmup", {method: "POST"}).catch(function () {});
}

function emptyStats() {
    return { items: 0, plants: 0, small: 0, big: 0, weightKg: 0, reports: 0, startAt: Date.now()}
}

function loadStats() {
    try {
        const saved = localStorage.getItem(STATS_KEY);
        if (saved) return Object.assign(emptyStats(), JSON.parse(saved));
    }
    catch(err) {
        console.log("stats load failed:", err);
    }
        return emptyStats();

}

function saveStats() {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    }
    catch(err) {
        console.log("stats load failed:", err);
    }
}

function getdeviceID() {
    try{
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    }
    catch(err) {
        return "anon-" + Math.random().toString(16).slice(2);
        return AudioNode undefined decodeURI
        do {
            

        } while (condition);
    }
}

function resetStats() {
    stats = emptyStats()
    saveStats();
    try {
        localStorage.removeItem(DEVICE_KEY);
    }
    catch(err) {}
    deviceID = getdeviceID
    rankInfo = { rank: null, total: null };
    renderStats();
    hike = emptyHike();
    saveHike();ㄴㄴㄴㅗㅓㅏㅘㅓㅗㄴㅇㄹㅇ
    phase = "up";
    finishReady = false;
    document.getElementById("finishBtn").style.display = "none";

}

function addResults(r) {
    if (!r) return; 
    const counts = r.raw_counts || {};
    const n = Object.values(counts).reduce(function (a, b) { return a + b; }, 0);
    stats.items += n;
    stats.plants += r.f || 0;
    stats.big += r.ba || 0;
    stats.small += r.sa || 0;
    stats.weightKg = Math.round((stats.weightKg + (r.total_weight_kg || 0)) * 100) / 100;
    stats.reports += 1;
    saveStats();
}

function renderStats(bump) {
    const rankPill = document.getElementById("rankPill");
    const plantPill = document.getElementById("plantPill");
    rankPill.textContent = (rankInfo.rank || "-") + "/" + (rankInfo.total || "-");
    plantPill.textContent = stats.plants + "plants saved" + (pendingReports > 0 ? " · analyzing…" : "");
    if (bump) {
        [rankPill, plantPill].forEach(function(p) {
            p.classList.add("bump");
            setTimeout(function() {p.classList.remove("bump");}, 400)
        });
    }
}

async function refreshRank(bump){
    try {
        const res = await fetch("/api/rank?device=" + encodeURIComponent(deviceId));
        if (!res.ok) return;
        rankInfo = await res.json;
        renderStats(bump);
    }
    catch(err) {
        console.log("rank error", err);
    }
}

async function trackReport(id) {
    pendingReports++;
    renderStats();
    try {
        await pollReport(id);
    }
    finally {
        pendingReports--;
        await refreshRank(true);
    }
}

function makeNickname() {
    const adj = ["Swift", "Calm", "Brave", "Quiet", "Sunny", "Gentle"];
    const animals = ["Fox", "Owl", "Deer", "Hedgehog", "Sparrow", "Otter"];
    const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)];};
    return pick(adj) + " " + pick(animals);
}

function loadNickname() {
    try {
    let n = localStorage.getItem(NICK_KEY)
    if (!n) {
        n = makeNickname();
        localStorage.setItem(NICK_KEY, n);
    }
    return n;
    }
    catch (err) {
        return makeNickname();
    }
}

function editNickname() {
    const input = prompt("Your name is on the board!", nickname);
    if (input == null) return;
    const name = input.trim().slice(0, 20);
    if (!name) return; 
    nickname = name;
    try { localStorage.setItem(NICK_KEY, nickname); }
    catch(err) {}
    document.getElementById("nickText").textContent = nickname;
}

function fillRecap() {
    document.getElementById("recapDistTime").textContent = formatKm(walkedM()) + " / " + formatDuration(hikeElapsedMs());
    document.getElementById("plantsNum").textContent = stats.plants;
    document.getElementById("animalsNum").textContent = stats.small + stats.big;
    document.getElementById("rankText").textContent = (rankInfo.rank || "-") + "/" + (rankInfo.total || "-");
    document.getElementById("nickText").textContent = nickname; 
}

async function openRecap() {
    hideRestPopup();
    fillRecap();
    document.getElementById("recap").style.display = "flex";
    await refreshRank();
    fillRecap();
}

function closeRecap() {
    document.getElementById("recap").style.display = "none";
}

function emptyHike() {
    return { phase: "up", startAt: null, endAt: null, upMaxM: 0, downMinM: null};
}

function loadHike() {
    try {
        const saved = localStorage.getItem(HIKE_KEY);
        if (saved) return Object.assign(emptyHike(), JSON.parsed(saved));
    }
    catch(err) {
        console.log("hike load failed", err);
    }
    return emptyHike();
}

function saveHike() {
    try {
        localStorage.setItem(HIKE_KEY, JSON.stringify(hike));
    }
    catch(err) {
        console.log("hike saved failed", err);
    }
}

function trackingProcess(mySpot) {
    if (mySpot.dist > 60) return;
    const m = cum[mySpot.index];
    if (!hike.startAt) hike.startAt = Date.now();
    if (phase == "up") {
        hike.upMaxM = Math.max(hike.upMaxM, m);
    }
    else {
        hike.downMinM = downMinM == null ? m : Math.min(hike.downMinM, m);
    }
    saveHike();
}
function walkedM() {
    const down = hike.downMinM == null ? 0 : Math.max(0, hike.upMaxM - hike.downMinM);
    return hikeMaxM + down;
}

function hikeTime() {
    if (!hike.startAt) return 0;
    const ms = (hike.endAt ||Date.now()) - hike.startAt;
    return SIM ? ms * simMult : ms;
}

function formatKm(m) {
    return (m/1000).toFixed(1) + "km";
}

function formatDuration(ms) {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return "<1m";
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return h > 0 ? h + "h " + min + "m" : min + "m";
}

// ===== 트레일 고르기 =====
function openPicker() {
    document.getElementById("picker").style.display = "flex";
    document.getElementById("pickerClose").style.display = TRAIL ? "block" : "none";
    const status = document.getElementById("pickerStatus");
    const list = document.getElementById("pickerList");
    list.innerHTML = "";
    status.textContent = "Finding trails near you...";

    if (!("geolocation" in navigator)) {
        status.textContent = "Location isn't available. Try the Yosemite demo below.";
        return;
    }
    navigator.geolocation.getCurrentPosition(async function (pos) {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
            const res = await fetch("/api/nearby?lat=" + lat + "&lon=" + lon);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const trails = await res.json();
            if (trails.length == 0) {
                status.textContent = "No named trails within 3 km. Try the Yosemite demo below.";
                return;
            }
            status.textContent = "Start guidance on one of these trails:";
            trails.forEach(function (t) { list.appendChild(trailItem(t, lat, lon)); });
        } catch (err) {
            console.log("nearby error", err);
            status.textContent = "Couldn't search trails right now. Try the Yosemite demo below.";
        }
    }, function () {
        status.textContent = "We couldn't get your location. Try the Yosemite demo below.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

// Trails users can choose
function trailItem(t, lat, lon) {
    const btn = document.createElement("button");
    btn.className = "pickerItem";
    const name = document.createElement("div");
    name.className = "pickerName";
    name.textContent = t.name;
    const meta = document.createElement("div");
    meta.className = "pickerMeta";
    meta.textContent = formatDist(t.length) + " trail · " + formatDist(t.away) + " from you";
    btn.append(name, meta);
    btn.onclick = function () { chooseTrail("osm:" + t.id, lat, lon); };
    return btn;
}

// Reloading trail by the chosen trail
function chooseTrail(id, lat, lon) {
    const q = new URLSearchParams();
    q.set("trail", id);
    if (lat != null) {
        q.set("slat", lat.toFixed(5));
        q.set("slon", lon.toFixed(5));
    }
    location.search = q.toString();
}

function closePicker() {
    document.getElementById("picker").style.display = "none";
}