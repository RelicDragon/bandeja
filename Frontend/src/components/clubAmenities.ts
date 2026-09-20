/**
 * Club amenity chips, shared by `ClubDetailPanel` and the public club page (PRD 354).
 */

export function amenityEntries(amenities: Record<string, unknown> | undefined | null): { key: string; label: string }[] {
  if (!amenities || typeof amenities !== 'object') return [];
  const out: { key: string; label: string }[] = [];
  for (const [k, v] of Object.entries(amenities)) {
    if (v === true) out.push({ key: k, label: k });
    else if (typeof v === 'string' && v.trim()) out.push({ key: k, label: `${k}: ${v.trim()}` });
  }
  return out;
}
