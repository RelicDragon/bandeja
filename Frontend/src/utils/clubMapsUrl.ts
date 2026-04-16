export function getClubMapsSearchUrl(params: {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const lat = params.latitude;
  const lng = params.longitude;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const addr = params.address?.trim();
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  }
  return null;
}
