/* Leaflet setup */
var map = L.map("mapid", { zoomControl: true }).setView([48.13031436327439, 11.58350715686779], 17);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
        'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 20,
}).addTo(map);

/* Füge eine Satelliten-Kachel-Ebene hinzu (Mapbox) */
// Mapbox Access Token vom Server abrufen
fetch('/api/mapbox-token')
    .then(response => response.json())
    .then(data => {
        var satelliteLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${data.accessToken}`, {
            maxZoom: 19,
            tileSize: 512,
            zoomOffset: -1,
            attribution: '© Mapbox © OpenStreetMap'
        }).addTo(map);
    })
    .catch(error => {
        console.error('Fehler beim Abrufen des Mapbox-Tokens:', error);
    });

/* ShadeMap setup */
// ShadeMap API-Key vom Server abrufen
let shadeMap;
fetch('/api/shademap-key')
    .then(response => response.json())
    .then(data => {
        const loaderEl = document.getElementById('loader');
        let now = new Date();

        shadeMap = L.shadeMap({
            apiKey: data.apiKey,
            date: now,
            color: '#7a6a6e',
            opacity: 0.7,
            terrainSource: {
                maxZoom: 15,
                tileSize: 256,
                getSourceUrl: ({ x, y, z }) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
                getElevation: ({ r, g, b, a }) => (r * 256 + g + b / 256) - 32768,
                _overzoom: 18,
            },
            getFeatures: async () => {
                try {
                    if (map.getZoom() > 15) {
                        const bounds = map.getBounds();
                        const north = bounds.getNorth();
                        const south = bounds.getSouth();
                        const east = bounds.getEast();
                        const west = bounds.getWest();
                        const query = `https://overpass-api.de/api/interpreter?data=%2F*%0AThis%20has%20been%20generated%20by%20the%20overpass-turbo%20wizard.%0AThe%20original%20search%20was%3A%0A%E2%80%9Cbuilding%E2%80%9D%0A*%2F%0A%5Bout%3Ajson%5D%5Btimeout%3A25%5D%3B%0A%2F%2F%20gather%20results%0A%28%0A%20%20%2F%2F%20query%20part%20for%3A%20%E2%80%9Cbuilding%E2%80%9D%0A%20%20way%5B%22building%22%5D%28${south}%2C${west}%2C${north}%2C${east}%29%3B%0A%29%3B%0A%2F%2F%20print%20results%0Aout%20body%3B%0A%3E%3B%0Aout%20skel%20qt%3B`;
                        const response = await fetch(query)
                        const json = await response.json();
                        const geojson = osmtogeojson(json);
                        // If no building height, default to one storey of 3 meters
                        geojson.features.forEach(feature => {
                            if (!feature.properties) {
                                feature.properties = {};
                            }
                            if (!feature.properties.height) {
                                feature.properties.height = 3;
                            }
                        });
                        return geojson.features;
                    }
                } catch (e) {
                    console.error(e);
                }
                return [];
            },
            debug: (msg) => { console.log(new Date().toISOString(), msg) }
        }).addTo(map);

        shadeMap.on('tileloaded', (loadedTiles, totalTiles) => {
            loaderEl.innerText = `Loading: ${(loadedTiles / totalTiles * 100).toFixed(0)}%`;
        });

        // Initiale Stunde auf der Karte einstellen
        updateMapShadow(now.getHours());
    })
    .catch(error => {
        console.error('Fehler beim Abrufen des ShadeMap API-Schlüssels:', error);
    });

/* Controls setup */
let intervalTimer;
const increment = document.getElementById('increment');
const decrement = document.getElementById('decrement');
const play = document.getElementById('play');
const stop = document.getElementById('stop');
const exposure = document.getElementById('exposure');
const exposureGradientContainer = document.getElementById('exposure-gradient-container');
const exposureGradient = document.getElementById('exposure-gradient');

if (increment) {
    increment.addEventListener('click', () => {
        now = new Date(now.getTime() + 3600000);
        shadeMap.setDate(now);
    }, false);
}

if (decrement) {
    decrement.addEventListener('click', () => {
        now = new Date(now.getTime() - 3600000);
        shadeMap.setDate(now);
    }, false);
}

if (play) {
    play.addEventListener('click', () => {
        intervalTimer = setInterval(() => {
            now = new Date(now.getTime() + 60000);
            shadeMap.setDate(now);
        }, 100);
    });
}

if (stop) {
    stop.addEventListener('click', () => {
        clearInterval(intervalTimer);
    })
}

if (exposure) {
    exposure.addEventListener('click', (e) => {
        clearInterval(intervalTimer);
        const target = e.target;
        if (!target.checked) {
            shadeMap && shadeMap.setSunExposure(false);
            increment.disabled = false;
            decrement.disabled = false;
            play.disabled = false;
            stop.disabled = false;
            exposureGradientContainer.style.display = 'none';
        } else {
            const { lat, lng } = map.getCenter();
            const { sunrise, sunset } = SunCalc.getTimes(now, lat, lng);
            shadeMap && shadeMap.setSunExposure(true, {
                startDate: sunrise,
                endDate: sunset
            });
            increment.disabled = true
            decrement.disabled = true;
            play.disabled = true;
            stop.disabled = true;

            const hours = (sunset - sunrise) / 1000 / 3600;
            const partial = hours - Math.floor(hours);
            const html = [];
            for (let i = 0; i < hours; i++) {
                html.push(`<div>${i + 1}</div>`)
            }
            html.push(`<div style="flex: ${partial}"></div>`);
            exposureGradientContainer.style.display = 'block';
            exposureGradient.innerHTML = html.join('');
        }
    })
}

// Setze das Datum auf heute beim Laden der Seite
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Monat ist 0-basiert
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    document.getElementById('date-picker').value = formattedDate;
});

// Funktion, um den Schatten der Karte basierend auf der Stunde einzustellen
function updateMapShadow(hour) {
    const currentHour = hour % 24; // Stelle sicher, dass die Stunde zwischen 0 und 23 liegt

    // Erhalte das aktuelle Datum und passe die Stunde an
    let shadowDate = new Date(now);
    shadowDate.setHours(currentHour, 0, 0, 0); // Setze Stunde, Minute, Sekunde und Millisekunde auf 0

    // Aktualisiere die Schattenkarte mit dem neuen Datum
    shadeMap.setDate(shadowDate);

    // Zeige die aktualisierte Stunde im hour-display an (falls vorhanden)
    const hourDisplay = document.getElementById('hour-display');
    if (hourDisplay) {
        hourDisplay.innerText = shadowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

// Event Listener für die Stunde erhöhen
document.getElementById('increment-hour').addEventListener('click', () => {
    now = new Date(now.getTime() + 3600000);
    updateMapShadow(now.getHours());
});

// Event Listener für die Stunde verringern
document.getElementById('decrement-hour').addEventListener('click', () => {
    now = new Date(now.getTime() - 3600000);
    updateMapShadow(now.getHours());
});

// Funktion, um ein bestimmtes Restaurant weltweit zu suchen
document.getElementById('search-button').addEventListener('click', function() {
    var location = document.getElementById('location-search').value;

    if (location) {
        // Verwende eine Geocoding API, um die Adresse in Koordinaten umzuwandeln
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    var lat = data[0].lat;
                    var lon = data[0].lon;
                    // Zentriere die Karte auf die gefundenen Koordinaten
                    map.setView(new L.LatLng(lat, lon), 18);

                    // Füge einen Marker auf der Karte hinzu
                    L.marker([lat, lon]).addTo(map)
                        .bindPopup(`<b>${location}</b>`).openPopup();
                } else {
                    alert('Ort nicht gefunden.');
                }
            })
            .catch(error => {
                console.error('Fehler bei der Suche:', error);
                alert('Es gab ein Problem bei der Suche nach dem Ort.');
            });
    } else {
        alert('Bitte geben Sie einen Ort ein.');
    }
});
