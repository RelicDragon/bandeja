const MAX_CHARS = 14000;

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PadelPulseBot/1.0; +https://github.com/padelpulse)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return JSON.stringify({ url, error: `HTTP ${res.status}`, text: "" });
  }
  const html = await res.text();
  const text = stripHtml(html);
  const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "…" : text;
  return JSON.stringify({ url, length: truncated.length, text: truncated }, null, 0);
}
