#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

const inputFileArg = process.argv[2] || 'italy-clubs.json';
const outputFileArg = process.argv[3] || 'clubs-map.html';

const inputFile = path.isAbsolute(inputFileArg) 
  ? inputFileArg 
  : path.join(SCRIPT_DIR, inputFileArg);
const outputFile = path.isAbsolute(outputFileArg)
  ? outputFileArg
  : path.join(SCRIPT_DIR, outputFileArg);

console.log(`Reading ${inputFile}...`);
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const adminAreaKeys = [...new Set(
  data
    .filter(item => item.address?.coordinate?.lat && item.address?.coordinate?.lon)
    .map(item => item.address?.administrative_area ?? '__null__')
)];
const PALETTE = ['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6','#bfef45','#fabed4','#469990','#dcbeff','#9a6324','#fffac8','#800000','#aaffc3','#808000','#ffd8b1','#000075','#a9a9a9'];
const adminAreaToColor = {};
adminAreaKeys.forEach((k, i) => { adminAreaToColor[k] = PALETTE[i % PALETTE.length]; });

const locations = data
  .filter(item => item.address?.coordinate?.lat && item.address?.coordinate?.lon)
  .map(item => {
    const adminArea = item.address?.administrative_area ?? null;
    const key = adminArea ?? '__null__';
    return {
      lat: item.address.coordinate.lat,
      lng: item.address.coordinate.lon,
      name: item.tenant_name || 'Unknown',
      city: item.address?.city ?? '',
      adminArea,
      color: adminAreaToColor[key]
    };
  });

console.log(`Found ${locations.length} locations with coordinates`);

const centerLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
const centerLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clubs Map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        #map {
            height: 100vh;
            width: 100%;
        }
        #info {
            position: absolute;
            top: 10px;
            left: 10px;
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            z-index: 1000;
        }
        .pin { background: none !important; border: none !important; }
    </style>
</head>
<body>
    <div id="info">
        <strong>Total locations: ${locations.length}</strong>
    </div>
    <div id="map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const locations = ${JSON.stringify(locations)};
        const center = [${centerLat}, ${centerLng}];

        const map = L.map('map').setView(center, 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        locations.forEach((location) => {
            const icon = L.divIcon({
                className: 'pin',
                html: \`<span style="background:\${location.color};width:12px;height:12px;border:2px solid #333;border-radius:50%;display:block;margin:-8px 0 0 -8px"></span>\`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            const marker = L.marker([location.lat, location.lng], { icon }).addTo(map);
            const locLine = [location.city, location.adminArea != null ? location.adminArea : ''].filter(Boolean).join(', ');
            marker.bindPopup(\`<strong>\${location.name}</strong><br>\${locLine || '—'}<br>Lat: \${location.lat}<br>Lng: \${location.lng}\`);
        });
    </script>
</body>
</html>`;

fs.writeFileSync(outputFile, html);
console.log(`Generated ${outputFile}`);
console.log(`Open ${outputFile} in your browser to view the map`);
