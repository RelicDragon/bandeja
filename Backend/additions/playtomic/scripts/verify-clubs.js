import "dotenv/config";
import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createChatCompletion } from "../lib/openaiRateLimit.js";
import { geocode } from "../lib/geocode.js";
import { webSearch } from "../tools/search.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSONS_DIR = join(__dirname, "..", "jsons");
const JSONS_ORIGINALS_DIR = join(__dirname, "..", "jsons-originals");

function isDirectoryListing(club) {
  const name = (club.tenant_name || "").toLowerCase();
  const desc = (club.description || "").toLowerCase();
  if (/yandex\s+maps\s+category|flamp\s*(moscow)?\s*[—\-]\s*падел|flamp\s*[—\-].*каталог|category\s+listing/.test(name)) return true;
  if (/not a single (venue|club)|directory rather than|страница каталога|directory (list|page)|каталог.*клубов|Wikimapia tag directory/.test(desc)) return true;
  return false;
}

function hasNoRealAddress(club) {
  const street = (club.address?.street ?? "").trim();
  return !street || street === "unknown";
}

async function verifyWithOpenAI(club) {
  const name = club.tenant_name || "";
  const street = club.address?.street ?? "";
  const city = club.address?.city ?? "";
  const country = club.address?.country ?? "";
  const desc = (club.description || "").slice(0, 300);
  const response = await createChatCompletion(
    {
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: `Is this a REAL padel club (one physical venue) or a DIRECTORY/listing/category page? Reply with exactly one word: REAL or DIRECTORY.\nName: ${name}\nAddress: ${street}, ${city}, ${country}\nDescription: ${desc}`,
        },
      ],
      max_tokens: 10,
    },
    null
  );
  const text = (response.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
  return text.includes("REAL") && !text.includes("DIRECTORY");
}

function buildGeocodeQueries(club) {
  const a = club.address || {};
  const street = (a.street ?? "").trim();
  const city = a.city || "";
  const country = a.country || "";
  const name = club.tenant_name || "";
  const q1 = street && street !== "unknown" ? [street, city, country] : [name, city, country];
  const q2 = [name, city, country].filter(Boolean).join(", ");
  return [q1.filter(Boolean).join(", "), q2].filter((q, i, arr) => !arr.slice(0, i).includes(q));
}

async function geocodeWithTavily(club) {
  const query = buildGeocodeQueries(club)[0];
  const out = await webSearch(`${query} padel address location`, { limit: 5 });
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    return null;
  }
  const snippets = (data.results ?? []).map((r) => r.snippet || r.title || "").join("\n");
  if (!snippets) return null;
  const response = await createChatCompletion(
    {
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: `From the following search results about a padel venue, extract the exact latitude and longitude in decimal degrees if mentioned. Reply with ONLY two numbers separated by space: lat lon. If no coordinates found reply: NONE.\n\n${snippets.slice(0, 2000)}`,
        },
      ],
      max_tokens: 30,
    },
    null
  );
  const text = (response.choices?.[0]?.message?.content ?? "").trim();
  if (/none/i.test(text)) return null;
  const match = text.match(/(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat: String(lat), lon: String(lon), display_name: "" };
}

async function geocodeWithOpenAI(club) {
  const fullAddress = buildGeocodeQueries(club)[0];
  if (!fullAddress) return null;
  const response = await createChatCompletion(
    {
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: `What are the latitude and longitude in decimal degrees for this address: ${fullAddress}? Reply with ONLY two numbers separated by a space: lat lon. Example: 55.7558 37.6173`,
        },
      ],
      max_tokens: 30,
    },
    null
  );
  const text = (response.choices?.[0]?.message?.content ?? "").trim();
  const match = text.match(/(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat: String(lat), lon: String(lon), display_name: "" };
}

function hasValidCoords(club) {
  const lat = (club.address?.coordinate?.lat ?? "").toString().trim();
  const lon = (club.address?.coordinate?.lon ?? "").toString().trim();
  if (!lat || !lon) return false;
  const nlat = Number(lat);
  const nlon = Number(lon);
  if (lat === "unknown" || lon === "unknown") return false;
  return Number.isFinite(nlat) && Number.isFinite(nlon) && nlat !== 0 && nlon !== 0;
}

async function verifyFile(inputPath, outputPath) {
  console.log("Verify clubs: reading", inputPath);
  const raw = readFileSync(inputPath, "utf8");
  let clubs = JSON.parse(raw);
  if (!Array.isArray(clubs)) clubs = [clubs];
  const total = clubs.length;
  console.log("Total clubs in file:", total);

  const afterHeuristic = clubs.filter((c) => !isDirectoryListing(c));
  const removedHeuristic = total - afterHeuristic.length;
  if (removedHeuristic) {
    console.log("Removed by heuristics (directory/listing):", removedHeuristic);
    clubs.filter((c) => isDirectoryListing(c)).forEach((c) => console.log("  -", c.tenant_name));
  }

  let verified = [];
  for (let i = 0; i < afterHeuristic.length; i++) {
    const club = afterHeuristic[i];
    const ok = await verifyWithOpenAI(club);
    if (ok) {
      verified.push(club);
      console.log(`[${i + 1}/${afterHeuristic.length}] REAL: ${club.tenant_name}`);
    } else {
      console.log(`[${i + 1}/${afterHeuristic.length}] DIRECTORY (removed): ${club.tenant_name}`);
    }
  }

  console.log("Geocoding", verified.length, "clubs...");
  const withCoords = [];
  for (let i = 0; i < verified.length; i++) {
    const club = verified[i];
    if (hasValidCoords(club) && !hasNoRealAddress(club)) {
      withCoords.push(club);
      console.log(`  [${i + 1}/${verified.length}] ${club.tenant_name} (has coords, skipped)`);
      continue;
    }
    const queries = buildGeocodeQueries(club);
    let result = null;
    for (const q of queries) {
      result = await geocode(q);
      if (result) break;
    }
    if (!result) result = await geocodeWithTavily(club);
    if (!result) result = await geocodeWithOpenAI(club);
    if (result) {
      if (!club.address) club.address = {};
      if (!club.address.coordinate) club.address.coordinate = { lat: "", lon: "" };
      club.address.coordinate.lat = result.lat;
      club.address.coordinate.lon = result.lon;
      if (hasNoRealAddress(club) && result.display_name) club.address.street = result.display_name;
      withCoords.push(club);
      console.log(`  [${i + 1}/${verified.length}] ${club.tenant_name} -> ${result.lat}, ${result.lon}`);
    } else {
      if (hasValidCoords(club)) {
        withCoords.push(club);
        console.log(`  [${i + 1}/${verified.length}] ${club.tenant_name} (kept existing coords)`);
      } else {
        console.log(`  [${i + 1}/${verified.length}] ${club.tenant_name} -> no coords, removed`);
      }
    }
  }

  writeFileSync(outputPath, JSON.stringify(withCoords, null, 2), "utf8");
  console.log("Done. Verified clubs:", withCoords.length);
  console.log("Written to", outputPath);
}

async function main() {
  const singleInput = process.argv[2];
  const jsonFiles = singleInput
    ? [singleInput]
    : readdirSync(JSONS_DIR)
        .filter((f) => f.endsWith(".json") && !f.includes("-verified"))
        .map((f) => join(JSONS_DIR, f))
        .sort();

  if (jsonFiles.length === 0) {
    console.log("No JSON files in", JSONS_DIR);
    return;
  }

  console.log("Processing", jsonFiles.length, "file(s) from jsons folder");
  const fromJsonsDir = !singleInput;
  if (fromJsonsDir) mkdirSync(JSONS_ORIGINALS_DIR, { recursive: true });

  for (const inputPath of jsonFiles) {
    let readPath = inputPath;
    const baseName = join(inputPath).split(/[/\\]/).pop();
    if (fromJsonsDir) {
      const originalsPath = join(JSONS_ORIGINALS_DIR, baseName);
      renameSync(inputPath, originalsPath);
      readPath = originalsPath;
    }
    const outputPath = process.argv[3] && jsonFiles.length === 1
      ? process.argv[3]
      : fromJsonsDir
        ? join(JSONS_DIR, baseName.replace(/\.json$/i, "-verified.json"))
        : inputPath.replace(/\.json$/i, "-verified.json");
    await verifyFile(readPath, outputPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
