export function normalizeWebCameraUrl(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
  return String(raw).trim();
}
