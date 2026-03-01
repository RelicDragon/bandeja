const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api/";
const RATE_LIMIT_MS = 1100;

let lastRequest = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  lastRequest = Date.now();
}

function toResult(feat, isPhoton = false) {
  const lat = isPhoton ? feat?.geometry?.coordinates?.[1] : feat?.lat;
  const lon = isPhoton ? feat?.geometry?.coordinates?.[0] : feat?.lon;
  if (lat == null || lon == null) return null;
  const name = feat?.properties?.name ?? feat?.display_name ?? "";
  const street = feat?.properties?.street ?? "";
  const city = feat?.properties?.city ?? feat?.properties?.locality ?? "";
  const display_name = [street, city, name].filter(Boolean).join(", ") || name || String(feat?.display_name ?? "");
  return { lat: String(lat), lon: String(lon), display_name };
}

export async function geocode(query) {
  await rateLimit();
  const params = new URLSearchParams({ q: query, format: "json", limit: "1" });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": "Bandeja-VerifyClubs/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.[0];
  if (first?.lat && first?.lon) return toResult(first);
  await rateLimit();
  const pParams = new URLSearchParams({ q: query, limit: "1" });
  const pRes = await fetch(`${PHOTON_URL}?${pParams}`);
  if (!pRes.ok) return null;
  const pData = await pRes.json();
  const pHit = pData?.features?.[0];
  if (pHit?.geometry?.coordinates?.length >= 2) return toResult(pHit, true);
  return null;
}
