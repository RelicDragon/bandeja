export const CLUB_DETAILS_SYSTEM = `You are a researcher. Use web_search and fetch_page to gather detailed information about the given padel club.
Collect: full address (street, postal code, city, country, country code); phone number; number of courts and whether they are indoor or outdoor; opening hours if available; facilities (parking, lockers, cafe, wifi, changeroom, disabled access); short description.
Summarize everything in a clear text block. If something is unknown, say "unknown".`;

export function clubDetailsUser(clubName, url, city, country) {
  const context = [clubName];
  if (url) context.push(`Website: ${url}`);
  context.push(`Location: ${city}${country ? ", " + country : ""}`);
  return `Get full details for this padel club:\n${context.join("\n")}`;
}

export const DETAIL_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search for information about a padel club, its address, phone, or opening hours.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description: "Fetch and read the main text content of a URL (club website or listing page).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Full URL" } },
        required: ["url"],
      },
    },
  },
];
