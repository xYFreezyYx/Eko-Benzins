const map = L.map('map', {
    center: [56.95, 24.1],
    zoom: 12,
    attributionControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

let routeLayer;
document.getElementById("year").textContent = new Date().getFullYear();

// Convert address to coordinates using Nominatim API
async function geocode(address) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.length > 0) {
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            display_name: data[0].display_name
        };
    } else {
        throw new Error(`Adrese nav atrasta: ${address}`);
    }
}

// Simulated traffic multiplier function
// This function simulates traffic conditions based on the time of day and day of the week
function getSimulatedTrafficMultiplier() {
    const date = new Date();
    const hour = date.getHours();
    const day = date.getDay();
    let multiplier = 1.0;

    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
        multiplier = 1.2; // Rush hour
    } else if (hour >= 10 && hour <= 15) {
        multiplier = 1.1; // Moderate traffic
    } else {
        multiplier = 1.0; // Low traffic
    }

    if (day === 0 || day === 6) {
        multiplier -= 0.1;
    }

    return Math.max(multiplier, 1.0);
}

// This function converts seconds to a formatted time string (hh:mm:ss or mm:ss or ss)
function convertSecondstoTime(sec) {
    dateObj = new Date(sec * 1000);
    hours = dateObj.getUTCHours();
    minutes = dateObj.getUTCMinutes();
    seconds = dateObj.getSeconds();

    if (hours === 0 && minutes !== 0) {
        timeString = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0') + ' min';
    } else if (hours === 0 && minutes === 0 && seconds !== 0) {
        timeString = seconds.toString().padStart(2, '0') + ' sec';
    }else {
        timeString = hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0') + ' h';
    }
    
    return timeString;
}

// Function to create colored markers
function createColoredMarker(color) {
    return new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

// Function to validate route information input fields
function validateRouteInfo() {
    const routeInfo = document.getElementById('routeInfo');
    const elementCount= routeInfo.querySelectorAll('*'); 
    let elId = [];
    let routeInfoSet = false;
    let elIdValue = [];

    elementCount.forEach(el => {
        elId.push(el.id);
    });

    for (let i = 0; i < elId.length; i++) {
        if (i === 0 && document.getElementById('from').value !== "") {
            elIdValue.push(elId[i]);
        } else if (document.getElementById(elId[i]).value !== "") {
            elIdValue.push(elId[i]);
        }
    }

    if (elIdValue.length === elementCount.length) {
        routeInfoSet = true;
    }

    return routeInfoSet;
}

// Function to add or remove destination input fields
function destinationAddRemove(btn) {
    const destinationDiv = document.getElementById('routeInfo');

    if (btn === 1) {
        const newDestination = document.createElement('input');
        newDestination.type = 'text';
        newDestination.id = 'to' + (destinationDiv.children.length);
        newDestination.placeholder =  destinationDiv.children.length + '. Galapunkta adrese';
        destinationDiv.appendChild(newDestination);
    } else if (btn === 0) {
        const lastDestination = destinationDiv.lastElementChild;
        if (lastDestination && lastDestination.id !== 'to1') {
            destinationDiv.removeChild(lastDestination);
        } else {
            alert('Vismaz viens galapunkts ir jānorāda!');
        }
    }
}

// Route distance, fuel consumption, and time calculation
async function calculateRoute() {
    const cityFuel = parseFloat(document.getElementById('cityFuel').value);
    const highwayFuel = parseFloat(document.getElementById('highwayFuel').value);
    const infoDiv = document.getElementById('info');
    const routeInfoValid = validateRouteInfo();

    if (!routeInfoValid || isNaN(cityFuel) || isNaN(highwayFuel)) {
        alert('Lūdzu, aizpildiet visus ievades laukus!');
        return;
    }

    // Show loading spinner
    const loadingSpinner = document.getElementById('loading');
    loadingSpinner.style.display = 'block';
    infoDiv.classList.remove("show");

    const trafficMultiplier = getSimulatedTrafficMultiplier();
    
    try {
        // Get all input fields dynamically
        const inputs = document.querySelectorAll('#routeInfo input');
        let addresses = [];
        inputs.forEach(input => {
            if (input.value.trim() !== '') {
                addresses.push(input);
            }
        });

        // Geocode all addresses
        const coords = await Promise.all(addresses.map(input => geocode(input.value)));
        coords.forEach((coord, index) => {
            addresses[index].value = coord.display_name;
        });

        // Build body for Valhalla
        const body = {
            locations: coords.map(c => ({ lat: c.lat, lon: c.lon })),
            costing: "auto",
            directions_options: { units: "kilometers" },
            costing_options: {
                auto: { use_tolls: 0.5, use_highways: 1 }
            }
        };

        // Fetch route
        const valhallaRes = await fetch("https://valhalla1.openstreetmap.de/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!valhallaRes.ok) {
            const errorData = await valhallaRes.json();
            if (errorData.error_code === 154) {
                alert("Maršruts ir pārāk garš! Maksimālais pieļaujamais attālums ir 1500 km.");
            } else {
                alert(`Kļūda no maršruta servera: ${errorData.error || "Nezināma kļūda"}`);
            }
            return;
        }

        const routeData = await valhallaRes.json();
        const distance = routeData.trip.summary.length;
        const shape = routeData.trip.legs.flatMap(leg => decodePolyline(leg.shape)); // Merge all legs
        const time = routeData.trip.summary.time;

        // Clear old layers
        if (routeLayer) {
            map.removeLayer(routeLayer);
        }
        routeLayer = L.layerGroup().addTo(map);

        const startIcon = createColoredMarker('green');
        const stopIcon = createColoredMarker('blue');
        const finishIcon = createColoredMarker('red');

        // Add markers for each point
        coords.forEach((coord, index) => {
            let icon;
            let popupText;

            if (index === 0) {
                icon = startIcon;
                popupText = "Start";
            } else if (index === coords.length - 1) {
                icon = finishIcon;
                popupText = "Finish";
            } else {
                icon = stopIcon;
                popupText = `Stop ${index}`;
            }

            L.marker([coord.lat, coord.lon], { icon }).addTo(routeLayer).bindPopup(popupText);
        });

        // Draw the route
        const highwayRegex = /\b([AEM])\s?\d+\b/i;
        let highwayDistance = 0;
        let cityDistance = 0;
        let lastColor = 'blueviolet';

        const polylinesWeight5 = [];
        const polylinesWeight3 = [];

        const legs = routeData.trip.legs;

        legs.forEach((leg, legIdx) => {
            const legDistance = leg.summary.length;
            let legShape = decodePolyline(leg.shape);
            let legShapeIndex = 0;
            let legShapeLength = legShape.length;
            let maneuvers = leg.maneuvers;

            const isOdd = (legIdx % 2 === 0);
            const cityColor = isOdd ? 'blueviolet' : '#bc91ea';
            const highwayColor = isOdd ? 'crimson' : '#FF5349';
            const weight = isOdd ? 5 : 3;
        
            maneuvers.forEach((m) => {
                const street_names = m.street_names || [];
                const dist = m.length;
        
                const proportion = dist / legDistance;
                const pointCount = Math.max(2, Math.round(proportion * legShapeLength));
                const segmentLatLngs = legShape.slice(legShapeIndex, legShapeIndex + pointCount);
                legShapeIndex += pointCount - 1;
        
                const highway = street_names.some(name => highwayRegex.test(name));
                const color = highway ? highwayColor : cityColor;
                const polylineData = { latlngs: segmentLatLngs, color, weight };
        
                if (weight === 5) {
                    polylinesWeight5.push(polylineData);
                } else {
                    polylinesWeight3.push(polylineData);
                }
        
                lastColor = color;
        
                if (highway) {
                    highwayDistance += dist;
                } else {
                    cityDistance += dist;
                }
            });
        
            // Draw any remaining points in the leg
            if (legShapeIndex < legShapeLength - 1) {
                const remainingLatLngs = legShape.slice(legShapeIndex);
                if (remainingLatLngs.length > 1) {
                    const polylineData = { latlngs: remainingLatLngs, color: lastColor, weight };
                    if (weight === 5) {
                        polylinesWeight5.push(polylineData);
                    } else {
                        polylinesWeight3.push(polylineData);
                    }
                }
            }
        });
        
        // Draw all weight 5 polylines first
        polylinesWeight5.forEach(pl =>
            L.polyline(pl.latlngs, { color: pl.color, weight: pl.weight }).addTo(routeLayer)
        );
        // Then draw all weight 3 polylines on top
        polylinesWeight3.forEach(pl =>
            L.polyline(pl.latlngs, { color: pl.color, weight: pl.weight }).addTo(routeLayer)
        );

        // 50/50 split for city and highway distances if both are zero
        if (cityDistance + highwayDistance === 0) {
            cityDistance = distance / 2;
            highwayDistance = distance / 2;
        }

        const adjustedCityFuel = cityFuel * trafficMultiplier;
        const highwayFuelUsed = (highwayDistance * highwayFuel) / 100;
        const cityFuelUsed = (cityDistance * adjustedCityFuel) / 100;
        const totalFuelUsed = cityFuelUsed + highwayFuelUsed;

        infoDiv.innerHTML = `
            <p class="res"><strong class="resLbl">Distance:</strong> ${distance.toFixed(2)} km</p>
            <p class="res"><strong class="resLbl">Aptuvenais laiks:</strong> ${convertSecondstoTime(time)}</p>
            <p class="res"><strong class="resLbl">Aptuvenais patēriņš:</strong> ${totalFuelUsed.toFixed(2)} L</p>
            <p class="city"><em><strong>Pilsēta:</strong> ${cityFuelUsed.toFixed(2)} L × ${trafficMultiplier.toFixed(2)} satiksmes ietekme</em></p>
            <p class="highway"><em><strong>Uz šosejas:</strong> ${highwayFuelUsed.toFixed(2)} L</em></p>
        `;
        infoDiv.classList.add("show");

        const bounds = L.latLngBounds(shape);
        map.fitBounds(bounds, { padding: [50, 50] });
        document.getElementById('centerOnRoute').style.display = 'block';
        window.lastRouteBounds = bounds;

    } catch (err) {
        console.error(err);
        alert(err.message);
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

// Center on route
function centerOnRoute() {
    if (window.lastRouteBounds) {
        map.fitBounds(window.lastRouteBounds, { padding: [50, 50] });
    }
}

// Decode polyline function
function decodePolyline(encoded) {
    let coords = [], index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;
        shift = 0; result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;
        coords.push([lat / 1e6, lng / 1e6]);
    }
    return coords;
}