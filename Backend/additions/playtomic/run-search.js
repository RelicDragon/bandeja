import "dotenv/config";
import { runPipeline } from "./runPipeline.js";

const city = process.argv[2] || process.env.SEARCH_CITY || "";
const country = process.argv[3] || process.env.SEARCH_COUNTRY || "";
const maxClubs = parseInt(process.env.MAX_CLUBS || "0", 10) || 0;

if (!city) {
  console.error("Usage: node run-search.js <city> [country]");
  console.error("  or set SEARCH_CITY and optionally SEARCH_COUNTRY, MAX_CLUBS in .env");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required in .env");
  process.exit(1);
}

if (!process.env.SERPER_API_KEY) {
  console.error("SERPER_API_KEY is required in .env for web search");
  process.exit(1);
}

runPipeline(city, country, {
  maxClubs: maxClubs || 0,
  onProgress: (n, total, name) => console.log(`[${n}/${total}] ${name}`),
  onError: (name, err) => console.error(`Error for ${name}:`, err.message),
})
  .then(({ filePath, count }) => {
    console.log(`Done. ${count} clubs written to ${filePath}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
