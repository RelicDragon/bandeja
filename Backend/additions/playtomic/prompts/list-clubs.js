export const LIST_CLUBS_SYSTEM = `You are a researcher building an exhaustive list of padel venues in a city.

Rules:
1. Use web_search many times (at least 8–12 distinct queries). Do NOT stop after 1–2 searches.
2. Vary queries: different languages (e.g. for Russia use Russian: падел, корты падел; for Spain use Spanish), and different phrasings: "padel clubs", "padel courts", "padel centers", "where to play padel", "list of padel [city]", "[city] padel", "padel [city] booking".
3. For large cities (e.g. Moscow, Madrid, London) aim for 30–50+ venues. Keep searching until you have a comprehensive list or have run 10+ searches.
4. From each search result, extract every distinct club/venue: official name and website or map URL. Use "url": "" if none.
5. Merge and deduplicate: same club may appear in multiple searches; keep one entry per unique venue (match by similar name).
6. When you have finished all searches, respond with a single JSON array only, no other text. Format: [{"name":"Club Name","url":"https://..."}, ...]`;

export function listClubsUser(city, country = "", hint = "") {
  const place = country ? `${city}, ${country}` : city;
  let msg = `Build an exhaustive list of ALL padel clubs and padel courts in ${place}. Use many web_search calls with different queries (different languages and phrasings). Aim for 30–50+ venues in large cities. Return one JSON array of objects with "name" and "url" for each unique venue.`;
  if (hint) msg += "\n\n" + hint;
  return msg;
}

export const LIST_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for padel clubs, padel courts, or venues in a city.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
];
