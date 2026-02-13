export const CLUB_JSON_SCHEMA = {
  tenant_id: "uuid (use placeholder PLACEHOLDER_TENANT_ID)",
  tenant_name: "string",
  slug: "lowercase-hyphenated-name",
  address: {
    street: "string",
    postal_code: "string",
    city: "string",
    sub_administrative_area: "string",
    administrative_area: "string",
    country: "string",
    country_code: "ISO 2",
    coordinate: { lat: "number", lon: "number" },
    timezone: "IANA e.g. Europe/Belgrade",
  },
  images: "array (empty if unknown)",
  properties: {
    CONTACT_PHONE: "string",
    FACILITY_CHANGEROOM: "true or false string",
    FACILITY_FREE_PARKING: "true or false string",
    FACILITY_PRIVATE_PARKING: "true or false string",
    FACILITY_CAFETERIA: "true or false string",
    FACILITY_WIFI: "true or false string",
    FACILITY_LOCKERS: "true or false string",
    FACILITY_DISABLED_ACCESS: "true or false string",
    SPORT_PADEL: "true",
  },
  resources: [
    {
      resourceId: "use placeholder PLACEHOLDER_RESOURCE_ID for each court",
      name: "Court name e.g. Padel 1 - Outdoor",
      sport: "PADEL",
      features: ["indoor or outdoor", "double", "wall"],
    },
  ],
  opening_hours: {
    MONDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    TUESDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    WEDNESDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    THURSDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    FRIDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    SATURDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    SUNDAY: { opening_time: "HH:MM", closing_time: "HH:MM" },
    HOLIDAYS: { opening_time: "HH:MM", closing_time: "HH:MM" },
  },
  sport_ids: ["PADEL"],
  communications_language: "en_US",
  description: "string",
};

export const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
  "HOLIDAYS",
];

export function slugify(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function fillPlaceholders(club) {
  const tenantId = crypto.randomUUID();
  const out = JSON.parse(JSON.stringify(club));
  out.tenant_id = tenantId;
  if (out.resources && Array.isArray(out.resources)) {
    out.resources = out.resources.map((r) => ({
      ...r,
      resourceId: r.resourceId?.startsWith("PLACEHOLDER") ? crypto.randomUUID() : r.resourceId,
    }));
  }
  if (!out.slug || out.slug.startsWith("PLACEHOLDER")) out.slug = slugify(out.tenant_name);
  return out;
}
