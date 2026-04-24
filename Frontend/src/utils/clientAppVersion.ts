export function getClientAppSemver(): string {
  const v = import.meta.env.VITE_APP_SEMVER;
  return typeof v === 'string' && v.trim() ? v.trim() : '0.0.0';
}
