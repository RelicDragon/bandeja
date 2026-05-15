export function isLegacyAccessJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { typ?: string };
    return payload.typ !== 'access';
  } catch {
    return true;
  }
}
