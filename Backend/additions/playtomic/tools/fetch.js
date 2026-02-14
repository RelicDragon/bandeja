import { tavily } from "@tavily/core";
import { addTavilyExtract } from "../ui/stats.js";

const MAX_CHARS = 14000;

function getClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is required in .env for fetch_page");
  return tavily({ apiKey });
}

export async function fetchPage(url, options = {}) {
  const stats = options.stats ?? null;
  const client = getClient();
  try {
    const response = await client.extract([url], {
      extractDepth: "basic",
      format: "text",
      includeUsage: !!stats,
    });
    if (stats) addTavilyExtract(stats, response.usage ?? null);
    const results = response.results ?? [];
    const first = results.find((r) => r.url === url) ?? results[0];
    if (!first?.rawContent) {
      return JSON.stringify({ url, error: "No content extracted", text: "" }, null, 0);
    }
    const text =
      first.rawContent.length > MAX_CHARS
        ? first.rawContent.slice(0, MAX_CHARS) + "…"
        : first.rawContent;
    return JSON.stringify({ url, length: text.length, text }, null, 0);
  } catch (err) {
    return JSON.stringify(
      { url, error: err.message ?? "Extract failed", text: "" },
      null,
      0
    );
  }
}
