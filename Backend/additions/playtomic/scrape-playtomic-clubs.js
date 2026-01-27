#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCRIPT_DIR = __dirname;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requestTimestamps = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    
    // Remove timestamps older than the window
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    // If we've reached the limit, wait until the oldest request is outside the window
    if (this.requestTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = this.windowMs - (now - oldestTimestamp) + 1;
      if (waitTime > 0) {
        await delay(waitTime);
        // Update now after waiting
        const newNow = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(
          timestamp => newNow - timestamp < this.windowMs
        );
      }
    }
    
    // Record this request
    this.requestTimestamps.push(Date.now());
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function extractNextData(html) {
  const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find __NEXT_DATA__ script tag');
  }
  return JSON.parse(scriptMatch[1]);
}

function findClubSearchResults(items) {
  return items.find(item => item.component === 'club_search_results');
}

function extractClubsFromData(data) {
  const pageProps = data.pageProps || data.props?.pageProps;
  if (!pageProps?.story?.content?.body?.[0]?.items) {
    throw new Error('Could not find expected data structure');
  }
  
  const clubSearchItem = findClubSearchResults(pageProps.story.content.body[0].items);
  if (!clubSearchItem) {
    throw new Error('Could not find club_search_results component');
  }
  
  const blokData = clubSearchItem.__blokData;
  return {
    total: blokData.total,
    clubs: blokData.clubs || []
  };
}

function collectProperties(club, propertiesMap) {
  if (club.properties && typeof club.properties === 'object') {
    Object.keys(club.properties).forEach(key => {
      const value = club.properties[key];
      if (!propertiesMap.hasOwnProperty(key)) {
        propertiesMap[key] = value !== null && value !== undefined ? value : null;
      } else if (value !== null && value !== undefined && (propertiesMap[key] === null || propertiesMap[key] === undefined)) {
        propertiesMap[key] = value;
      }
    });
  }
}

function collectFeatures(club, featuresSet) {
  if (club.resources && Array.isArray(club.resources)) {
    club.resources.forEach(resource => {
      if (resource.features && Array.isArray(resource.features)) {
        resource.features.forEach(feature => {
          featuresSet.add(feature);
        });
      }
    });
  }
}

function collectSportIds(club, sportIdsSet) {
  if (club.sport_ids && Array.isArray(club.sport_ids)) {
    club.sport_ids.forEach(sportId => {
      sportIdsSet.add(sportId);
    });
  }
}

async function fetchClubDetails(slug) {
  const clubUrl = `https://playtomic.com/clubs/${slug}`;
  const html = await fetchUrl(clubUrl);
  const nextData = extractNextData(html);
  
  const pageProps = nextData.props?.pageProps;
  if (!pageProps) {
    throw new Error(`Could not find pageProps for club ${slug}`);
  }
  
  const tenant = pageProps.tenant;
  const description = pageProps.tenantDescriptionHTML || '';
  
  return {
    ...tenant,
    description
  };
}

async function scrapeCity(cityName, rateLimiter) {
  console.log(`Fetching data for city: ${cityName}...`);
  
  const searchUrl = `https://playtomic.com/search?q=${encodeURIComponent(cityName)}`;
  console.log(`Fetching initial page: ${searchUrl}`);
  
  await rateLimiter.waitIfNeeded();
  await randomDelay(20, 100);
  const html = await fetchUrl(searchUrl);
  const nextData = extractNextData(html);
  const buildId = nextData.buildId;
  
  console.log(`Found buildId: ${buildId}`);
  
  const initialData = extractClubsFromData(nextData);
  let allClubs = [...initialData.clubs];
  const total = initialData.total;
  
  console.log(`Found ${initialData.clubs.length} clubs on page 1 (total: ${total})`);
  
  if (total > allClubs.length) {
    const totalPages = Math.ceil(total / initialData.clubs.length);
    console.log(`Fetching ${totalPages - 1} additional pages...`);
    
    for (let page = 2; page <= totalPages; page++) {
      await rateLimiter.waitIfNeeded();
      await randomDelay(20, 100);
      const pageUrl = `https://playtomic.com/_next/data/${buildId}/en/search.json?q=${encodeURIComponent(cityName)}&page=${page}`;
      console.log(`Fetching page ${page}: ${pageUrl}`);
      
      try {
        const pageData = await fetchUrl(pageUrl);
        const pageJson = JSON.parse(pageData);
        const pageClubs = extractClubsFromData(pageJson);
        allClubs = allClubs.concat(pageClubs.clubs);
        console.log(`Page ${page}: Found ${pageClubs.clubs.length} clubs (total so far: ${allClubs.length})`);
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error.message);
        break;
      }
    }
  }
  
  return allClubs;
}

function loadGlobalData() {
  const jsonsDataDir = path.join(SCRIPT_DIR, 'jsons-data');
  const featuresFile = path.join(jsonsDataDir, 'playtomic-clubs-features.json');
  const propertiesFile = path.join(jsonsDataDir, 'playtomic-clubs-properties.json');
  const sportIdsFile = path.join(jsonsDataDir, 'playtomic-clubs-sport-ids.json');
  
  let featuresSet = new Set();
  let propertiesMap = {};
  let sportIdsSet = new Set();
  
  if (fs.existsSync(featuresFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(featuresFile, 'utf8'));
      if (Array.isArray(data)) {
        featuresSet = new Set(data);
      }
    } catch (error) {
      console.warn(`Warning: Could not read ${featuresFile}:`, error.message);
    }
  }
  
  if (fs.existsSync(propertiesFile)) {
    try {
      propertiesMap = JSON.parse(fs.readFileSync(propertiesFile, 'utf8'));
      if (typeof propertiesMap !== 'object' || Array.isArray(propertiesMap)) {
        propertiesMap = {};
      }
    } catch (error) {
      console.warn(`Warning: Could not read ${propertiesFile}:`, error.message);
    }
  }
  
  if (fs.existsSync(sportIdsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(sportIdsFile, 'utf8'));
      if (Array.isArray(data)) {
        sportIdsSet = new Set(data);
      }
    } catch (error) {
      console.warn(`Warning: Could not read ${sportIdsFile}:`, error.message);
    }
  }
  
  return { featuresSet, propertiesMap, sportIdsSet };
}

function generateMap(clubs, outputFile) {
  const locations = clubs
    .filter(item => item.address?.coordinate?.lat && item.address?.coordinate?.lon)
    .map(item => ({
      lat: item.address.coordinate.lat,
      lng: item.address.coordinate.lon,
      name: item.tenant_name || 'Unknown'
    }));

  if (locations.length === 0) {
    console.log('No locations with coordinates found, skipping map generation');
    return;
  }

  console.log(`Generating map with ${locations.length} locations...`);

  const centerLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
  const centerLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

  const mapsDir = path.join(SCRIPT_DIR, 'maps');
  const baseFileName = path.basename(outputFile, '.json');
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
  console.log(`Generated map: ${mapFile}`);
}

async function main() {
  try {
    const cityName = await question('Enter city name: ');
    
    if (!cityName.trim()) {
      console.error('City name cannot be empty');
      process.exit(1);
    }
    
    const { featuresSet, propertiesMap, sportIdsSet } = loadGlobalData();
    console.log(`Loaded existing data: ${featuresSet.size} features, ${Object.keys(propertiesMap).length} properties, ${sportIdsSet.size} sport_ids`);
    
    const rateLimiter = new RateLimiter(99, 60000);
    const clubs = await scrapeCity(cityName.trim(), rateLimiter);
    
    console.log(`\nFetching detailed info for ${clubs.length} clubs...`);
    const detailedClubs = [];
    
    const initialFeaturesCount = featuresSet.size;
    const initialPropertiesCount = Object.keys(propertiesMap).length;
    const initialSportIdsCount = sportIdsSet.size;
    
    for (let i = 0; i < clubs.length; i++) {
      const club = clubs[i];
      await rateLimiter.waitIfNeeded();
      await randomDelay(20, 100);
      try {
        console.log(`Fetching details for club ${i + 1}/${clubs.length}: ${club.name}`);
        const detailedClub = await fetchClubDetails(club.slug);
        detailedClubs.push(detailedClub);
        
        collectProperties(detailedClub, propertiesMap);
        collectFeatures(detailedClub, featuresSet);
        collectSportIds(detailedClub, sportIdsSet);
      } catch (error) {
        console.error(`Error fetching details for club ${club.name} (${club.slug}):`, error.message);
      }
    }
    
    const baseFileName = cityName.toLowerCase().replace(/\s+/g, '-');
    const jsonsDir = path.join(SCRIPT_DIR, 'jsons');
    const jsonsDataDir = path.join(SCRIPT_DIR, 'jsons-data');
    const outputFile = path.join(jsonsDir, `${baseFileName}-clubs.json`);
    const globalPropertiesFile = path.join(jsonsDataDir, 'playtomic-clubs-properties.json');
    const globalFeaturesFile = path.join(jsonsDataDir, 'playtomic-clubs-features.json');
    const globalSportIdsFile = path.join(jsonsDataDir, 'playtomic-clubs-sport-ids.json');
    
    const sortedProperties = Object.keys(propertiesMap)
      .sort()
      .reduce((acc, key) => {
        acc[key] = propertiesMap[key];
        return acc;
      }, {});
    
    fs.writeFileSync(outputFile, JSON.stringify(detailedClubs, null, 2));
    fs.writeFileSync(globalPropertiesFile, JSON.stringify(sortedProperties, null, 2));
    fs.writeFileSync(globalFeaturesFile, JSON.stringify(Array.from(featuresSet).sort(), null, 2));
    fs.writeFileSync(globalSportIdsFile, JSON.stringify(Array.from(sportIdsSet).sort(), null, 2));
    
    const newFeaturesCount = featuresSet.size - initialFeaturesCount;
    const newPropertiesCount = Object.keys(propertiesMap).length - initialPropertiesCount;
    const newSportIdsCount = sportIdsSet.size - initialSportIdsCount;
    
    console.log(`\nSuccessfully scraped ${detailedClubs.length} clubs`);
    console.log(`Saved to: ${outputFile}`);
    console.log(`Properties: ${Object.keys(propertiesMap).length} total (${newPropertiesCount > 0 ? `+${newPropertiesCount} new` : 'no new'}), updated ${globalPropertiesFile}`);
    console.log(`Features: ${featuresSet.size} total (${newFeaturesCount > 0 ? `+${newFeaturesCount} new` : 'no new'}), updated ${globalFeaturesFile}`);
    console.log(`Sport IDs: ${sportIdsSet.size} total (${newSportIdsCount > 0 ? `+${newSportIdsCount} new` : 'no new'}), updated ${globalSportIdsFile}`);
    
    generateMap(detailedClubs, outputFile);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
