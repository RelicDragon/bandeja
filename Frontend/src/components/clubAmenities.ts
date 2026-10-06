/**
 * Club amenity chips, shared by `ClubDetailPanel` and the public club page (PRD 354).
 * `Club.amenities` is stored as `{ [key]: true | string }`; a `string[]` (written by the admin
 * panel) is accepted too.
 */

export function amenityEntries(amenities: Record<string, unknown> | unknown[] | undefined | null): { key: string; label: string }[] {
  if (!amenities || typeof amenities !== 'object') return [];
  if (Array.isArray(amenities)) {
    return amenities.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => ({ key: a, label: a }));
  }
  const out: { key: string; label: string }[] = [];
  for (const [k, v] of Object.entries(amenities)) {
    if (v === true) out.push({ key: k, label: k });
    else if (typeof v === 'string' && v.trim()) out.push({ key: k, label: `${k}: ${v.trim()}` });
  }
  return out;
}
