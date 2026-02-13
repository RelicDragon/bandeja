import { CLUB_JSON_SCHEMA } from "../schema.js";

const SCHEMA_STR = JSON.stringify(CLUB_JSON_SCHEMA, null, 2);

export const FORMAT_CLUB_SYSTEM = `You are a data formatter. Given information about a padel club, output a single JSON object that strictly follows this schema.
Use PLACEHOLDER_TENANT_ID for tenant_id and PLACEHOLDER_RESOURCE_ID for each resource's resourceId (one placeholder per court).
All properties must be strings "true" or "false". opening_hours use "HH:MM" 24h format. address.country_code is ISO 2 (e.g. RS, DE).
Output only the JSON object, no markdown or explanation.`;

export function formatClubUser(detailBlob, city, country) {
  return `Format this padel club into the schema. City context: ${city}${country ? ", " + country : ""}.

Schema:
${SCHEMA_STR}

Information to format:
${detailBlob}`;
}
