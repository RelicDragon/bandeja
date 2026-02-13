export const LIST_CLUBS_SYSTEM = `You are a researcher. Use the web_search tool to find a list of padel clubs or padel courts in the given city.
For each club you find, extract: the official club/venue name and, if available, its website URL or Google Maps link.
Respond with a JSON array only, no other text. Format: [{"name":"Club Name","url":"https://..."}, ...]
Use "url": "" when no URL is found. Include all padel venues you can find.`;

export function listClubsUser(city, country = "") {
  const place = country ? `${city}, ${country}` : city;
  return `Find all padel clubs and padel courts in ${place}. Return a JSON array of objects with "name" and "url" for each.`;
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
