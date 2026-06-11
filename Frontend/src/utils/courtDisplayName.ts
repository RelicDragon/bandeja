export type CourtNameParts = {
  name: string;
  integrationName?: string | null;
};

export function shouldShowIntegrationCourtName(
  name: string,
  integrationName?: string | null
): integrationName is string {
  if (!integrationName?.trim()) return false;
  return integrationName.trim().toLowerCase() !== name.trim().toLowerCase();
}

export function resolveCourtNameParts(
  name: string,
  integrationName?: string | null
): CourtNameParts {
  return {
    name,
    integrationName: shouldShowIntegrationCourtName(name, integrationName) ? integrationName.trim() : null,
  };
}
