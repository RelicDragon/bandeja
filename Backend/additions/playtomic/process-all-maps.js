#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const jsonsDir = path.join(SCRIPT_DIR, 'jsons');
const mapsDir = path.join(SCRIPT_DIR, 'maps');

function generateMap(clubs, jsonFilePath) {
  const locations = clubs
    .filter(item => item.address?.coordinate?.lat && item.address?.coordinate?.lon)
    .map(item => ({
      lat: item.address.coordinate.lat,
      lng: item.address.coordinate.lon,
      name: item.tenant_name || 'Unknown'
    }));

  if (locations.length === 0) {
    console.log('No locations with coordinates found, skipping map generation');
    return false;
  }

  const centerLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
  const centerLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

  const baseFileName = path.basename(jsonFilePath, '.json');
  const mapFile = path.join(mapsDir, `${baseFileName}-map.html`);
  
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
            const marker = L.marker([location.lat, location.lng]).addTo(map);
            marker.bindPopup(\`<strong>\${location.name}</strong><br>Lat: \${location.lat}<br>Lng: \${location.lng}\`);
        });
    </script>
</body>
</html>`;

  fs.writeFileSync(mapFile, html);
  return true;
}

function main() {
  console.log('Processing all JSON files in jsons directory...\n');
  
  if (!fs.existsSync(jsonsDir)) {
    console.error(`Error: ${jsonsDir} directory does not exist`);
    process.exit(1);
  }

  const files = fs.readdirSync(jsonsDir)
    .filter(file => file.endsWith('.json') && file.includes('-clubs.json'));

  if (files.length === 0) {
    console.log('No club JSON files found in jsons directory');
    return;
  }

  console.log(`Found ${files.length} JSON file(s) to process\n`);

  let successCount = 0;
  let skipCount = 0;

  files.forEach((file, index) => {
    const jsonFilePath = path.join(jsonsDir, file);
    console.log(`[${index + 1}/${files.length}] Processing ${file}...`);
    
    try {
      const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
      
      if (!Array.isArray(data)) {
        console.log(`  ⚠️  Skipping: ${file} is not an array`);
        skipCount++;
        return;
      }

      const generated = generateMap(data, jsonFilePath);
      
      if (generated) {
        console.log(`  ✅ Generated map for ${file}`);
        successCount++;
      } else {
        console.log(`  ⚠️  Skipped: ${file} has no locations with coordinates`);
        skipCount++;
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${file}:`, error.message);
      skipCount++;
    }
  });

  console.log(`\n✅ Completed: ${successCount} maps generated, ${skipCount} skipped`);
}

main();
