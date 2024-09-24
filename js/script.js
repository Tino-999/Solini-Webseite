
let now = new Date();

/* Leaflet setup */
var map = L.map("mapid", { zoomControl: true }).setView([48.13031436327439, 11.58350715686779], 17);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
        'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 20,
}).addTo(map);

/* Satelliten-Kachel-Ebene hinzufügen (Mapbox) */
var mapboxAccessToken = 'pk.eyJ1IjoidGlubzk5OSIsImEiOiJjbTBjcWZuZm4wNHgzMmtzZHRzMWo1dnIxIn0.VkbQqLZUSE3G1xRhmyc94g'; // <-- Ersetzen Sie dies durch Ihren tatsächlichen Mapbox Access Token

var satelliteLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-v12/tiles/{z}/{x}/{y}?access_token=${mapboxAccessToken}`, {
    maxZoom: 19,
    tileSize: 512,
    zoomOffset: -1,
    attribution: '© Mapbox © OpenStreetMap'
}).addTo(map);

/* ShadeMap setup */
var shadeMapApiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InRpbm9zY2h1bGR0MTAwQGdtYWlsLmNvbSIsImNyZWF0ZWQiOjE3MjQ3MDY3Nzg3MjAsImlhdCI6MTcyNDcwNjc3OH0.PVdyHPNZ4UFD9w_yc8_3QEAjEVEutB2QFV4rUipHGuY'; // <-- Ersetzen Sie dies durch Ihren tatsächlichen ShadeMap API Key

let shadeMap;
try {
    const loaderEl = document.getElementById('loader');
    now = new Date();

    shadeMap = L.shadeMap({
        apiKey: shadeMapApiKey,
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
                    const response = await fetch(query);
                    const json = await response.json();
                    const geojson = osmtogeojson(json);
                    // Wenn keine Gebäudehöhe vorhanden ist, standardmäßig 3 Meter setzen
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
} catch (error) {
    console.error('Fehler beim Initialisieren von ShadeMap:', error);
}

/* Controls setup */
let intervalTimer;
const increment = document.getElementById('increment-hour');
const decrement = document.getElementById('decrement-hour');

/**
 * Funktion zum Berechnen und Anzeigen der Sonnenzeiten
 */
function updateSunTimes() {
    if (!map || !map.getCenter()) {
        return;
    }

    const center = map.getCenter();
    const latitude = center.lat;
    const longitude = center.lng;

    // Berechne die Sonnenzeiten mit SunCalc
    const times = SunCalc.getTimes(now, latitude, longitude);

    // Formatiere die Zeiten
    const sunrise = times.sunrise ? times.sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const sunset = times.sunset ? times.sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

    // Aktualisiere die HTML-Elemente
    document.getElementById('sunrise-time').innerText = sunrise;
    document.getElementById('sunset-time').innerText = sunset;
}

/**
 * Funktion zum Aktualisieren des Uhrzeitpickers
 */
function updateTimePicker() {
    const timePicker = document.getElementById('time-picker');
    if (timePicker) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timePicker.value = `${hours}:${minutes}`;
    }
}

/**
 * Funktion, um den Schatten der Karte basierend auf der Stunde einzustellen
 */
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

    // Aktualisiere die Sonnenzeiten
    updateSunTimes();
}

/**
 * Initialisierung beim Laden der Seite
 */
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Monat ist 0-basiert
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.value = formattedDate;
    }

    // Initialisiere 'now' mit dem heutigen Datum und setze die Stunde auf die aktuelle Stunde
    now = today;
    updateMapShadow(now.getHours());

    // Initialisiere den Uhrzeitpicker
    updateTimePicker();

    // Aktualisiere die Sonnenzeiten
    updateSunTimes();
});

/**
 * Event Listener für den Uhrzeitpicker
 */
document.getElementById('time-picker').addEventListener('change', function(event) {
    const selectedTime = event.target.value; // Format: 'HH:MM'
    if (selectedTime) {
        const [hours, minutes] = selectedTime.split(':').map(Number);
        // Erstelle ein neues Date-Objekt basierend auf dem aktuellen Datum und der ausgewählten Uhrzeit
        const updatedDate = new Date(now);
        updatedDate.setHours(hours, minutes, 0, 0);
        now = updatedDate;

        // Aktualisiere die Schattenkarte mit der neuen Stunde
        updateMapShadow(now.getHours());

        // Optional: Aktualisiere die Anzeige der Stunde (falls vorhanden)
        const hourDisplay = document.getElementById('hour-display');
        if (hourDisplay) {
            hourDisplay.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }
});

/**
 * Event Listener für die Stunde erhöhen
 */
document.getElementById('increment-hour').addEventListener('click', () => {
    now = new Date(now.getTime() + 3600000); // Eine Stunde hinzufügen
    updateMapShadow(now.getHours());
    updateTimePicker(); // Uhrzeitpicker aktualisieren
});

/**
 * Event Listener für die Stunde verringern
 */
document.getElementById('decrement-hour').addEventListener('click', () => {
    now = new Date(now.getTime() - 3600000); // Eine Stunde abziehen
    updateMapShadow(now.getHours());
});    
/**
    * Event Listener für die Stunde erhöhen
    */
   document.getElementById('increment-hour').addEventListener('touchstart', () => {
       now = new Date(now.getTime() + 3600000); // Eine Stunde hinzufügen
       updateMapShadow(now.getHours());
       updateTimePicker(); // Uhrzeitpicker aktualisieren
   });
   
   /**
    * Event Listener für die Stunde verringern
    */
   document.getElementById('decrement-hour').addEventListener('touchstart', () => {
       now = new Date(now.getTime() - 3600000); // Eine Stunde abziehen
       updateMapShadow(now.getHours());    
    updateTimePicker(); // Uhrzeitpicker aktualisieren
});

/**
 * Event Listener für den Datumspicker
 */
document.getElementById('date-picker').addEventListener('change', function(event) {
    const selectedDate = event.target.value; // Format: 'YYYY-MM-DD'
    if (selectedDate) {
        // Parse das ausgewählte Datum
        const [year, month, day] = selectedDate.split('-').map(Number);
        // Behalte die aktuelle Uhrzeit bei
        const newDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());

        // Aktualisiere die 'now' Variable mit dem neuen Datum
        now = newDate;

        // Aktualisiere die Schattenkarte
        updateMapShadow(now.getHours());

        // Aktualisiere den Uhrzeitpicker
        updateTimePicker();
    }
});

/**
 * Funktion, um ein bestimmtes Restaurant weltweit zu suchen
 */
document.getElementById('search-button').addEventListener('click', function() {
    var location = document.getElementById('location-search').value;


    if (location) {
        // Verwende eine Geocoding API, um die Adresse in Koordinaten umzuwandeln
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    var lat = parseFloat(data[0].lat);
                    var lon = parseFloat(data[0].lon);
                    // Zentriere die Karte auf die gefundenen Koordinaten
                    map.setView(new L.LatLng(lat, lon), 18);

                    // Füge einen Marker auf der Karte hinzu
                    L.marker([lat, lon]).addTo(map)
                        .bindPopup(`<b>${location}</b>`).openPopup();

                    // Aktualisiere die Sonnenzeiten basierend auf der neuen Position
                    updateSunTimes();

                    // Optional: Aktualisiere den Uhrzeitpicker (falls sich die Zeit ändern sollte)
                    updateTimePicker();
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

document.getElementById('search-button').addEventListener('touchstart', function() {
    var location = document.getElementById('location-search').value;


    if (location) {
        // Verwende eine Geocoding API, um die Adresse in Koordinaten umzuwandeln
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.length > 0) {
                    var lat = parseFloat(data[0].lat);
                    var lon = parseFloat(data[0].lon);
                    // Zentriere die Karte auf die gefundenen Koordinaten
                    map.setView(new L.LatLng(lat, lon), 18);

                    // Füge einen Marker auf der Karte hinzu
                    L.marker([lat, lon]).addTo(map)
                        .bindPopup(`<b>${location}</b>`).openPopup();

                    // Aktualisiere die Sonnenzeiten basierend auf der neuen Position
                    updateSunTimes();

                    // Optional: Aktualisiere den Uhrzeitpicker (falls sich die Zeit ändern sollte)
                    updateTimePicker();
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

/**
 * Event Listener für Kartenbewegungen, um die Sonnenzeiten bei Positionsänderung zu aktualisieren
 */
map.on('moveend', function() {
    updateSunTimes();
    // Optional: Uhrzeitpicker aktualisieren, falls erforderlich
    // updateTimePicker();
});
