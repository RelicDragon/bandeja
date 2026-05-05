import "dotenv/config";
import { runPipeline } from "./runPipeline.js";
import { createStats } from "./ui/stats.js";
import { startLive, stopLive, render, renderFinal } from "./ui/cli.js";

const rawArgs = process.argv.slice(2);
const cityFlagIndex = rawArgs.indexOf("--city");
const countryFlagIndex = rawArgs.indexOf("--country");

const cityFromFlag = cityFlagIndex >= 0 ? (rawArgs[cityFlagIndex + 1] || "") : "";
const countryFromFlag = countryFlagIndex >= 0 ? (rawArgs[countryFlagIndex + 1] || "") : "";
const positionalArgs = rawArgs.filter((arg, idx) => {
  if (arg === "--city" || arg === "--country") return false;
  if (cityFlagIndex >= 0 && idx === cityFlagIndex + 1) return false;
  if (countryFlagIndex >= 0 && idx === countryFlagIndex + 1) return false;
  return true;
});

const city = cityFromFlag || positionalArgs[0] || process.env.SEARCH_CITY || "";
const country = countryFromFlag || positionalArgs[1] || process.env.SEARCH_COUNTRY || "";
const maxClubs = parseInt(process.env.MAX_CLUBS || "0", 10) || 0;

if (!city && !country) {
  console.error("Usage: node run-search.js <city> [country]");
  console.error("   or: node run-search.js --country <country> [--city <city>]");
  console.error("  or set SEARCH_CITY and/or SEARCH_COUNTRY, plus MAX_CLUBS in .env");
  process.exit(1);
}

const useDeepSeek = (process.env.LLM_PROVIDER || "").toLowerCase() === "deepseek";
if (useDeepSeek) {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("DEEPSEEK_API_KEY or OPENAI_API_KEY is required when LLM_PROVIDER=deepseek");
    process.exit(1);
  }
} else if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required in .env");
  process.exit(1);
}

if (!process.env.TAVILY_API_KEY) {
  console.error("TAVILY_API_KEY is required in .env for web search");
  process.exit(1);
}

const expandListSeeds =
  process.env.EXPAND_LIST_SEEDS != null && process.env.EXPAND_LIST_SEEDS !== ""
    ? JSON.parse(process.env.EXPAND_LIST_SEEDS)
    : country && country.toLowerCase() === "russia"
      ? [
          "Use Russian search queries: падел Москва, корты падел Москва, падел клубы Москва, где играть в падел Москва.",
          "Use: padel courts Moscow list, padel centers Moscow, where to play padel Moscow.",
        ]
      : null;

const state = {
  phase: "list",
  phaseLabel: "",
  current: 0,
  total: 0,
  clubName: "",
  error: "",
};
const stats = createStats();
let tickId = null;

function tick() {
  render(state, stats);
}

startLive();
tickId = setInterval(tick, 80);

runPipeline(city, country, {
  maxClubs: maxClubs || 0,
  stats,
  expandListSeeds,
  onPhase: (phase, data) => {
    state.phase = phase;
    state.error = "";
    if (data) {
      state.current = data.current ?? 0;
      state.total = data.total ?? 0;
      state.clubName = data.clubName ?? "";
    }
  },
  onProgress: (n, total, name) => {
    state.current = n;
    state.total = total;
    state.clubName = name;
  },
  onError: (name, err) => {
    state.error = err.message ?? String(err);
  },
})
  .then(({ filePath, count }) => {
    if (tickId) clearInterval(tickId);
    renderFinal(filePath, count, stats);
  })
  .catch((err) => {
    if (tickId) clearInterval(tickId);
    stopLive();
    console.error(err);
    process.exit(1);
  });
