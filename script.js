const apiKey = "5930a53b5721e24b2032e8c4ae2ca202";
let chart, windHumChart, map, marker;

// Unit: "metric" (°C) or "imperial" (°F)
let currentUnit = localStorage.getItem("unit") || "metric";

// Favorites list
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

// Last AQI for advice / alerts
let lastAQI = null;

// For alerts – max temp today from forecast
window._maxTodayTemp = null;

// Theme fixed to cosmic
let currentTheme = "cosmic";

// Last loaded city (for reload)
let lastCity = localStorage.getItem("lastCity") || null;

/* 🔮 THREE.JS OMNIVERSE BACKGROUND */
let bgScene, bgCamera, bgRenderer, bgParticles, bgAnimationId;

function initOmniverseBackground() {
    const canvas = document.getElementById("bg");
    const width = window.innerWidth;
    const height = window.innerHeight;

    bgScene = new THREE.Scene();
    bgCamera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    bgCamera.position.z = 5;

    bgRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    bgRenderer.setSize(width, height);
    bgRenderer.setPixelRatio(window.devicePixelRatio);

    // Particles
    const geometry = new THREE.BufferGeometry();
    const count = 800;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 20;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 0.08,
        color: 0x00ffee,
        transparent: true,
        opacity: 0.7
    });

    bgParticles = new THREE.Points(geometry, material);
    bgScene.add(bgParticles);

    animateOmniverseBackground();

    window.addEventListener("resize", onOmniverseResize);
}

function animateOmniverseBackground() {
    bgAnimationId = requestAnimationFrame(animateOmniverseBackground);
    if (bgParticles) {
        bgParticles.rotation.y += 0.0008;
        bgParticles.rotation.x += 0.0004;
    }
    if (bgRenderer && bgScene && bgCamera) {
        bgRenderer.render(bgScene, bgCamera);
    }
}

/* Resize */
function onOmniverseResize() {
    if (!bgRenderer || !bgCamera) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    bgRenderer.setSize(width, height);
    bgCamera.aspect = width / height;
    bgCamera.updateProjectionMatrix();
}

// Change background theme based on weather + day/night
function setOmniverseWeatherTheme(mainWeather, isDay) {
    if (!bgParticles) return;
    const mat = bgParticles.material;

    let color = 0x00ffee;
    let size = 0.08;
    let opacity = 0.7;

    const w = mainWeather.toLowerCase();

    if (w.includes("clear")) {
        color = isDay ? 0xffc857 : 0xf1c40f;
        size = 0.08;
        opacity = 0.85;
    } else if (w.includes("cloud")) {
        color = isDay ? 0xb0c4de : 0x95a5a6;
        size = 0.06;
        opacity = 0.6;
    } else if (w.includes("rain")) {
        color = 0x4fc3f7;
        size = 0.05;
        opacity = 0.8;
    } else if (w.includes("snow")) {
        color = 0xffffff;
        size = 0.09;
        opacity = 0.9;
    } else if (w.includes("thunder") || w.includes("storm")) {
        color = 0xff6b81;
        size = 0.1;
        opacity = 0.9;
    }

    mat.color.setHex(color);
    mat.size = size;
    mat.opacity = opacity;

    document.body.style.background = isDay
        ? "radial-gradient(circle at top, #1a2a6c, #000000 60%)"
        : "radial-gradient(circle at top, #000428, #000000 70%)";
}

/* On load */
window.onload = () => {
    updateUnitToggleUI();
    renderFavorites();
    initOmniverseBackground();
    startRotatingTips();

    // Enter key should trigger search
    const input = document.getElementById("cityInput");
    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchWeather();
            }
        });
    }

    // Global shortcut: Ctrl+K focuses search, Ctrl+1 current loc, Ctrl+2 toggle unit
    window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === "k") {
            e.preventDefault();
            const inputEl = document.getElementById("cityInput");
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
        }
        if (e.ctrlKey && e.key === "1") {
            e.preventDefault();
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    pos => getWeatherByCoords(pos.coords.latitude, pos.coords.longitude)
                );
            }
        }
        if (e.ctrlKey && e.key === "2") {
            e.preventDefault();
            toggleUnit();
        }
    });

    // Load last city if exists
    if (lastCity) {
        getWeather(lastCity);
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                getWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
                getWeather("Hyderabad");
            }
        );
    } else {
        getWeather("Hyderabad");
    }
};

/* Helpers */
function unitSymbol() {
    return currentUnit === "metric" ? "°C" : "°F";
}
function unitParam() {
    return currentUnit === "metric" ? "metric" : "imperial";
}

function setLastUpdated() {
    const el = document.getElementById("lastUpdated");
    if (!el) return;
    const now = new Date();
    el.innerText = `Last updated: ${now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    })}`;
}

/* Search */
function searchWeather() {
    const city = document.getElementById("cityInput").value.trim();
    if (!city) return;
    getWeather(city);
}

/* Voice search */
function startVoice() {
    if (!("webkitSpeechRecognition" in window)) {
        alert("Voice search not supported in this browser.");
        return;
    }
    const recognition = new webkitSpeechRecognition();
    recognition.onresult = function (event) {
        const city = event.results[0][0].transcript;
        document.getElementById("cityInput").value = city;
        searchWeather();
    };
    recognition.start();
}

/* Loader */
function setLoading(isLoading) {
    const el = document.getElementById("loading");
    if (!el) return;
    el.style.display = isLoading ? "block" : "none";
}

/* Small animation helpers */
function animateCardsOnUpdate() {
    const cards = document.querySelectorAll(".card");
    cards.forEach(c => c.classList.add("card--updating"));
    setTimeout(() => {
        cards.forEach(c => c.classList.remove("card--updating"));
    }, 250);
}

function animateTempPulse() {
    const tempEl = document.getElementById("temperature");
    if (!tempEl) return;
    tempEl.classList.add("temp-main--pulse");
    setTimeout(() => tempEl.classList.remove("temp-main--pulse"), 200);
}

/* Weather by city */
async function getWeather(city) {
    try {
        setLoading(true);
        document.getElementById("error").innerText = "";

        const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
                city
            )}&units=${unitParam()}&appid=${apiKey}`
        );
        const data = await res.json();
        if (data.cod !== 200) throw new Error();

        lastCity = data.name;
        localStorage.setItem("lastCity", lastCity);

        displayCurrent(data);
        await getForecast(data.name);
        await getAQI(data.coord.lat, data.coord.lon);
        await getUVIndex(data.coord.lat, data.coord.lon);
        initMap(data.coord.lat, data.coord.lon);

        addRecentCity(data.name);
    } catch (e) {
        document.getElementById("error").innerText = "City not found 😕";
    } finally {
        setLoading(false);
    }
}

/* Weather by coordinates */
async function getWeatherByCoords(lat, lon) {
    try {
        setLoading(true);
        document.getElementById("error").innerText = "";

        const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${unitParam()}&appid=${apiKey}`
        );
        const data = await res.json();

        lastCity = data.name;
        localStorage.setItem("lastCity", lastCity);

        displayCurrent(data);
        await getForecast(data.name);
        await getAQI(lat, lon);
        await getUVIndex(lat, lon);
        initMap(lat, lon);

        addRecentCity(data.name);
    } catch (e) {
        document.getElementById("error").innerText = "Could not load weather 😕";
    } finally {
        setLoading(false);
    }
}

/* Display current weather */
function displayCurrent(data) {
    document.getElementById("cityName").innerText =
        `${data.name}, ${data.sys.country}`;
    document.getElementById("temperature").innerText =
        Math.round(data.main.temp) + unitSymbol();
    document.getElementById("description").innerText =
        data.weather[0].description;

    const nowUnix = Math.floor(Date.now() / 1000);
    const sunrise = data.sys.sunrise;
    const sunset = data.sys.sunset;
    const isDay = nowUnix >= sunrise && nowUnix <= sunset;

    setOmniverseWeatherTheme(data.weather[0].main, isDay);
    updateDetailsCard(data);

    generateAIAdvice(data);
    generateMoodAndAllergy(data);
    setLastUpdated();

    const maxToday = window._maxTodayTemp;
    updateAlertBanner(data, maxToday || data.main.temp);

    // visual updates
    animateCardsOnUpdate();
    animateTempPulse();
}

/* Forecast */
async function getForecast(city) {
    const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
            city
        )}&units=${unitParam()}&appid=${apiKey}`
    );
    const data = await res.json();
    displayForecast(data);
    createChart(data);
    createWindHumChart(data);
    updateHourlyStrip(data);
    updateTodayMinMaxSummary(data);

    const tempsToday = data.list.slice(0, 8).map(i => i.main.temp);
    window._maxTodayTemp = tempsToday.length ? Math.max(...tempsToday) : null;
}

/* 5‑day forecast with per‑day min/max */
function displayForecast(data) {
    const grid = document.getElementById("forecastGrid");
    grid.innerHTML = "";

    // Group by date (YYYY-MM-DD)
    const daysMap = {};
    data.list.forEach(item => {
        const dateStr = item.dt_txt.split(" ")[0];
        if (!daysMap[dateStr]) daysMap[dateStr] = [];
        daysMap[dateStr].push(item);
    });

    const dates = Object.keys(daysMap).slice(0, 5);

    dates.forEach(dateStr => {
        const items = daysMap[dateStr];
        const temps = items.map(i => i.main.temp);
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        const noonItem =
            items.find(i => i.dt_txt.includes("12:00:00")) || items[0];
        const icon = noonItem.weather[0].icon;
        const main = noonItem.weather[0].main;

        const div = document.createElement("div");
        div.className = "forecast-item";
        div.innerHTML = `
            <h4>${new Date(dateStr).toLocaleDateString()}</h4>
            <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="">
            <p>Min: ${Math.round(min)}${unitSymbol()}</p>
            <p>Max: ${Math.round(max)}${unitSymbol()}</p>
            <p>${main}</p>
        `;
        grid.appendChild(div);
    });
}

/* Chart: next ~24 hours temp (8 points) */
function createChart(data) {
    const slice = data.list.slice(0, 8);
    const temps = slice.map(i => i.main.temp);
    const labels = slice.map(i => {
        const d = new Date(i.dt_txt);
        const day = d.toLocaleDateString(undefined, { weekday: "short" });
        const h = d.getHours().toString().padStart(2, "0");
        return `${day} ${h}:00`;
    });

    if (chart) chart.destroy();

    chart = new Chart(document.getElementById("tempChart"), {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Temp ${unitSymbol()}`,
                    data: temps,
                    borderColor: "#00ffcc",
                    backgroundColor: "rgba(0,255,204,0.1)",
                    tension: 0.3
                }
            ]
        },
        options: {
            plugins: {
                legend: { labels: { color: "#ffffff" } }
            },
            scales: {
                x: { ticks: { color: "#ffffff" } },
                y: { ticks: { color: "#ffffff" } }
            }
        }
    });
}

/* Wind & humidity chart */
function createWindHumChart(data) {
    const slice = data.list.slice(0, 8);
    const labels = slice.map(i => {
        const d = new Date(i.dt_txt);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });

    const wind = slice.map(i => i.wind.speed);
    const hum = slice.map(i => i.main.humidity);

    if (windHumChart) windHumChart.destroy();

    windHumChart = new Chart(document.getElementById("windHumChart"), {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Wind (${currentUnit === "metric" ? "m/s" : "mph"})`,
                    data: wind,
                    borderColor: "#ffad33",
                    backgroundColor: "rgba(255,173,51,0.1)",
                    tension: 0.3,
                    yAxisID: "y1"
                },
                {
                    label: "Humidity (%)",
                    data: hum,
                    borderColor: "#4fc3f7",
                    backgroundColor: "rgba(79,195,247,0.1)",
                    tension: 0.3,
                    yAxisID: "y2"
                }
            ]
        },
        options: {
            plugins: {
                legend: { labels: { color: "#ffffff" } }
            },
            scales: {
                x: { ticks: { color: "#ffffff" } },
                y1: {
                    position: "left",
                    ticks: { color: "#ffffff" }
                },
                y2: {
                    position: "right",
                    ticks: { color: "#ffffff" }
                }
            }
        }
    });
}

/* Hourly forecast strip for next 24h with comfort coloring */
function updateHourlyStrip(forecastData) {
    const strip = document.getElementById("hourlyStrip");
    if (!strip) return;

    strip.innerHTML = "";

    const slice = forecastData.list.slice(0, 8);
    slice.forEach(item => {
        const d = new Date(item.dt * 1000);
        const time = d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
        const icon = item.weather[0].icon;
        const temp = Math.round(item.main.temp);
        const weatherMain = item.weather[0].main;
        const pop = item.pop != null ? Math.round(item.pop * 100) : null;

        const comfortScore = computeComfortScore(temp, weatherMain);

        const div = document.createElement("div");
        div.className = "hourly-item";
        let bg = "rgba(255,255,255,0.08)";
        if (comfortScore >= 7) {
            bg = "rgba(34,197,94,0.3)";
        } else if (comfortScore <= 3) {
            bg = "rgba(248,113,113,0.35)";
        }
        div.style.background = bg;

        div.innerHTML = `
            <div>${time}</div>
            <img src="https://openweathermap.org/img/wn/${icon}.png" alt="">
            <div>${temp}${unitSymbol()}</div>
            <div>${weatherMain}</div>
            ${pop !== null ? `<div>${pop}% rain</div>` : ""}
        `;
        strip.appendChild(div);
    });
}

/* Today min/max summary (from first ~24h) */
function updateTodayMinMaxSummary(forecastData) {
    if (!forecastData || !forecastData.list || !forecastData.list.length) return;

    const slice = forecastData.list.slice(0, 8);
    const temps = slice.map(i => i.main.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);

    const summaryEl = document.getElementById("aiSummary");
    if (summaryEl) {
        summaryEl.innerText =
            `Today: around ${Math.round(min)}–${Math.round(max)}${unitSymbol()} with changing conditions.`;
    }
}

/* Comfort score 1–10 */
function computeComfortScore(temp, weatherMain) {
    let score = 5;
    const t = currentUnit === "metric" ? temp : ((temp - 32) * 5) / 9;

    if (t >= 22 && t <= 30) score += 3;
    if (t < 10 || t > 35) score -= 3;

    if (/rain|snow|storm|thunder/i.test(weatherMain)) score -= 2;
    if (/clear/i.test(weatherMain)) score += 1;

    if (score < 1) score = 1;
    if (score > 10) score = 10;
    return score;
}

/* AQI */
async function getAQI(lat, lon) {
    const res = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`
    );
    const data = await res.json();
    const aqiValue = data.list[0].main.aqi;
    lastAQI = aqiValue;

    let quality = "";
    if (aqiValue === 1) quality = "Good";
    else if (aqiValue === 2) quality = "Fair";
    else if (aqiValue === 3) quality = "Moderate";
    else if (aqiValue === 4) quality = "Poor";
    else if (aqiValue === 5) quality = "Very poor";

    document.getElementById("aqi").innerText =
        `Air Quality Index: ${aqiValue} (${quality})`;
}

/* UV Index using One Call API */
async function getUVIndex(lat, lon) {
    try {
        const res = await fetch(
            `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&appid=${apiKey}`
        );
        const data = await res.json();
        const uvi = data.current && typeof data.current.uvi === "number"
            ? data.current.uvi
            : null;

        if (uvi == null) {
            document.getElementById("uv").innerText = "UV Index: N/A";
            return;
        }

        let level = "";
        if (uvi < 3) level = "Low";
        else if (uvi < 6) level = "Moderate";
        else if (uvi < 8) level = "High";
        else if (uvi < 11) level = "Very high";
        else level = "Extreme";

        document.getElementById("uv").innerText =
            `UV Index: ${uvi.toFixed(1)} (${level})`;
    } catch (e) {
        document.getElementById("uv").innerText = "UV Index: N/A";
    }
}

/* Extra details card (includes feels-like vs actual) */
function updateDetailsCard(data) {
    const box = document.getElementById("details");
    if (!box) return;

    const feelsLike = Math.round(data.main.feels_like);
    const pressure = data.main.pressure;
    const humidity = data.main.humidity;
    const visibility =
        data.visibility != null ? (data.visibility / 1000).toFixed(1) : "N/A";
    const wind = data.wind ? data.wind.speed : 0;

    const sunrise = data.sys.sunrise
        ? new Date(data.sys.sunrise * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
          })
        : "N/A";
    const sunset = data.sys.sunset
        ? new Date(data.sys.sunset * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
          })
        : "N/A";

    const actual = Math.round(data.main.temp);
    let feelsNote = "";
    const diff = feelsLike - actual;
    if (Math.abs(diff) <= 1) {
        feelsNote = "Feels the same as actual.";
    } else if (diff > 1) {
        feelsNote = "Feels warmer than actual.";
    } else {
        feelsNote = "Feels cooler than actual.";
    }

    box.innerHTML = `
        <div class="detail-item"><strong>Feels like:</strong> ${feelsLike}${unitSymbol()} (${feelsNote})</div>
        <div class="detail-item"><strong>Humidity:</strong> ${humidity}%</div>
        <div class="detail-item"><strong>Pressure:</strong> ${pressure} hPa</div>
        <div class="detail-item"><strong>Visibility:</strong> ${visibility} km</div>
        <div class="detail-item"><strong>Wind:</strong> ${wind} ${
            currentUnit === "metric" ? "m/s" : "mph"
        }</div>
        <div class="detail-item"><strong>Sunrise:</strong> ${sunrise}</div>
        <div class="detail-item"><strong>Sunset:</strong> ${sunset}</div>
    `;
}

/* Smart alert banner */
function updateAlertBanner(currentData, maxTodayTemp) {
    const banner = document.getElementById("alertBanner");
    if (!banner) return;

    let msg = "";
    let bg = "";

    const weatherMain = currentData.weather[0].main;
    const aqi = lastAQI;

    const isHeatwave =
        maxTodayTemp &&
        maxTodayTemp > (currentUnit === "metric" ? 38 : 100);
    const isStorm = /thunder|storm/i.test(weatherMain);
    const isHeavyRain =
        /rain/i.test(weatherMain) &&
        currentData.rain &&
        (currentData.rain["1h"] || currentData.rain["3h"]);
    const veryBadAQI = aqi !== null && aqi >= 4;

    if (isHeatwave) {
        msg = `Heat alert: max around ${Math.round(
            maxTodayTemp
        )}${unitSymbol()} today. Avoid going out 12–3 PM.`;
        bg = "linear-gradient(90deg, #ff512f, #dd2476)";
    } else if (isStorm) {
        msg =
            "Storm alert: thunderstorm conditions. Stay indoors and avoid open areas.";
        bg = "linear-gradient(90deg, #373b44, #4286f4)";
    } else if (isHeavyRain) {
        msg =
            "Heavy rain alert: roads may flood, drive carefully and carry rain protection.";
        bg = "linear-gradient(90deg, #00c6ff, #0072ff)";
    } else if (veryBadAQI) {
        msg =
            "Air quality alert: very poor. Limit outdoor time and consider a mask.";
        bg = "linear-gradient(90deg, #8360c3, #2ebf91)";
    }

    if (msg) {
        banner.style.display = "block";
        banner.style.background = bg;
        banner.innerText = msg;
    } else {
        banner.style.display = "none";
    }
}

/* Map with Leaflet (clickable) */
function initMap(lat, lon) {
    if (!map) {
        map = L.map("map").setView([lat, lon], 10);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
            map
        );

        // Click on map to get weather for that point
        map.on("click", function (e) {
            const { lat, lng } = e.latlng;
            getWeatherByCoords(lat, lng);
        });
    } else {
        map.setView([lat, lon], 10);
    }
    if (marker) marker.remove();
    marker = L.marker([lat, lon]).addTo(map);
}

/* Strong AI advice */
function generateAIAdvice(data) {
    const tips = [];

    const temp = data.main.temp;
    const humidity = data.main.humidity;
    const weatherMain = data.weather[0].main;
    const windSpeed = data.wind ? data.wind.speed : 0;

    const isHot = temp > (currentUnit === "metric" ? 35 : 95);
    const isCold = temp < (currentUnit === "metric" ? 10 : 50);
    const windy = windSpeed > (currentUnit === "metric" ? 8 : 18);
    const veryHumid = humidity > 80;

    if (isHot) {
        tips.push("Very hot: avoid heavy outdoor activity in afternoon 🥵");
    } else if (isCold) {
        tips.push("Cold: wear layers, cover head and ears ❄");
    } else {
        tips.push("Comfortable temperature for most activities 🙂");
    }

    if (weatherMain.includes("Rain")) {
        tips.push("Carry umbrella or raincoat, roads may be slippery ☔");
    } else if (weatherMain.includes("Snow")) {
        tips.push("Snowy: walk slowly, use proper footwear ⛄");
    } else if (weatherMain.includes("Thunder")) {
        tips.push("Thunderstorm: stay indoors, avoid open areas ⚡");
    }

    if (veryHumid) {
        tips.push("High humidity: drink more water, take small breaks 💧");
    }

    if (windy) {
        tips.push("Windy: secure loose items, umbrella may not work well 🌬");
    }

    if (lastAQI !== null) {
        if (lastAQI >= 4) {
            tips.push(
                "Air quality is poor: limit outdoor time, consider a mask 😷"
            );
        } else if (lastAQI === 3) {
            tips.push(
                "Moderate air quality: okay for most, sensitive people be cautious."
            );
        }
    }

    const box = document.getElementById("aiAdvice");
    box.innerHTML = tips.map(t => "• " + t).join("<br>");

    const summaryEl = document.getElementById("aiSummary");
    if (summaryEl) {
        let main = data.weather[0].main;
        let tempNow = Math.round(data.main.temp);
        summaryEl.innerText =
            `Overall: ${main} and about ${tempNow}${unitSymbol()} right now.`;
    }
}

/* Weather mood + clothing + allergy */
function generateMoodAndAllergy(data) {
    const temp = data.main.temp;
    const humidity = data.main.humidity;
    const weatherMain = data.weather[0].main;
    const windSpeed = data.wind ? data.wind.speed : 0;

    const moodEl = document.getElementById("aiMood");
    const allergyEl = document.getElementById("aiAllergy");
    if (!moodEl || !allergyEl) return;

    const t = currentUnit === "metric" ? temp : ((temp - 32) * 5) / 9;

    // Mood & clothing
    let mood = "";
    if (t >= 32) {
        mood = "Feels hot and heavy. Light cotton, cap, and plenty of water.";
    } else if (t >= 24) {
        mood = "Warm and comfortable. T‑shirt is fine, carry light jacket for late evening.";
    } else if (t >= 16) {
        mood = "Cool and pleasant. Light hoodie or shirt is enough.";
    } else {
        mood = "Chilly. Wear warm layers, especially at night.";
    }

    if (/rain/i.test(weatherMain)) {
        mood += " Keep waterproof footwear and umbrella.";
    } else if (/snow/i.test(weatherMain)) {
        mood += " Wear gloves and good grip shoes.";
    }

    moodEl.innerText = mood;

    // Allergy note (simple heuristic)
    let allergy = "";
    if (lastAQI != null && lastAQI >= 4) {
        allergy = "Dust/smoke likely high. Sensitive people: mask recommended.";
    } else if (/rain/i.test(weatherMain)) {
        allergy = "Rain helps settle dust, good for dust allergy but watch for dampness.";
    } else if (windSpeed > (currentUnit === "metric" ? 8 : 18)) {
        allergy = "Windy: dust and pollen may travel more, avoid long outdoor time.";
    } else {
        allergy = "No major allergy risk detected, normal outdoor activity is fine.";
    }

    allergyEl.innerText = allergy;
}

/* Rotating tips */
const tipsList = [
    "Use Ctrl+K to focus the search bar instantly.",
    "High UV? Try to stay in shade between 12–3 PM.",
    "On very humid days, drink extra water even if you don’t feel thirsty.",
    "Storm alerts mean stay away from trees and open grounds.",
    "In high AQI, keep windows closed and avoid heavy outdoor exercise.",
    "Check hourly forecast before planning a long bike ride."
];
let tipIndex = 0;

function startRotatingTips() {
    const el = document.getElementById("rotatingTips");
    if (!el) return;
    el.innerText = tipsList[tipIndex];
    setInterval(() => {
        tipIndex = (tipIndex + 1) % tipsList.length;
        el.innerText = tipsList[tipIndex];
    }, 8000);
}

/* Favorites */

function renderFavorites() {
    const favBar = document.getElementById("favoritesBar");
    if (!favBar) return;

    favBar.innerHTML = "";
    favorites.forEach(city => {
        const btn = document.createElement("button");
        btn.className = "fav-btn";
        btn.innerText = city;
        btn.onclick = () => getWeather(city);
        favBar.appendChild(btn);
    });
}

function addFavoriteCity() {
    const current = document.getElementById("cityName").innerText;
    if (!current) return;
    const city = current.split(",")[0];
    if (!city) return;

    if (!favorites.includes(city)) {
        favorites.push(city);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        renderFavorites();
    }
}

// Auto-recent (keeps last 5)
function addRecentCity(name) {
    if (!name) return;
    if (!favorites.includes(name)) {
        favorites.push(name);
        if (favorites.length > 5) favorites.shift();
        localStorage.setItem("favorites", JSON.stringify(favorites));
        renderFavorites();
    }
}

/* Unit toggle */

function toggleUnit() {
    currentUnit = currentUnit === "metric" ? "imperial" : "metric";
    localStorage.setItem("unit", currentUnit);
    updateUnitToggleUI();

    const current = document.getElementById("cityName").innerText;
    if (current) {
        const city = current.split(",")[0];
        getWeather(city);
    }
}

function updateUnitToggleUI() {
    const btn = document.getElementById("unitToggle");
    if (!btn) return;
    btn.innerText = currentUnit === "metric" ? "Switch to °F" : "Switch to °C";
}

/* Compare cities */

let compareMode = false;

function toggleCompareMode() {
    compareMode = !compareMode;
    const card = document.getElementById("compareCard");
    if (card) card.style.display = compareMode ? "block" : "none";
}

async function compareCities() {
    const c1 = document.getElementById("compareCity1").value.trim();
    const c2 = document.getElementById("compareCity2").value.trim();
    const out = document.getElementById("compareResult");
    if (!c1 || !c2 || !out) return;

    out.innerText = "Comparing…";

    try {
        const [r1, r2] = await Promise.all([
            fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
                    c1
                )}&units=${unitParam()}&appid=${apiKey}`
            ),
            fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
                    c2
                )}&units=${unitParam()}&appid=${apiKey}`
            )
        ]);
        const d1 = await r1.json();
        const d2 = await r2.json();
        if (d1.cod !== 200 || d2.cod !== 200) {
            out.innerText = "One or both cities not found.";
            return;
        }

        const html = `
            <div><strong>${d1.name}</strong>: ${Math.round(
            d1.main.temp
        )}${unitSymbol()}, ${d1.weather[0].main}, Humidity ${d1.main.humidity}%</div>
            <div><strong>${d2.name}</strong>: ${Math.round(
            d2.main.temp
        )}${unitSymbol()}, ${d2.weather[0].main}, Humidity ${d2.main.humidity}%</div>
        `;
        out.innerHTML = html;
    } catch {
        out.innerText = "Error comparing cities.";
    }
}




