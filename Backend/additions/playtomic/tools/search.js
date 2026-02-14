import { tavily } from "@tavily/core";
import { addTavilySearch } from "../ui/stats.js";

function getClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is required in .env for web_search");
  return tavily({ apiKey });
}

export async function webSearch(query, options = {}) {
  const limit = options.limit ?? 20;
  const stats = options.stats ?? null;
  const client = getClient();
  const response = await client.search(query, {
    maxResults: Math.min(limit, 20),
    searchDepth: "basic",
    topic: "general",
    includeUsage: !!stats,
  });
  if (stats) addTavilySearch(stats, response.usage ?? null);
  const results = (response.results ?? []).slice(0, limit).map((r) => ({
    title: r.title ?? "",
    link: r.url ?? "",
    snippet: r.content ?? "",
  }));
  return JSON.stringify({ query, results }, null, 0);
}
