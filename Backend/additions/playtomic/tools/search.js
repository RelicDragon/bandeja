const SERPER_API = "https://google.serper.dev/search";

export async function webSearch(query, options = {}) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY is required in .env for web_search");
  }
  const limit = options.limit ?? 10;
  const res = await fetch(SERPER_API, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: limit }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const organic = data.organic || [];
  const snippets = organic.slice(0, limit).map((o) => ({
    title: o.title,
    link: o.link,
    snippet: o.snippet,
  }));
  return JSON.stringify({ query, results: snippets }, null, 0);
}
