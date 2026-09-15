export function isLegacyAccessJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { typ?: string; exp?: number };
    return payload.typ !== 'access';
  } catch {
    return true;
  }
}

export function isRestorableAccessJwt(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { typ?: string; exp?: number };
    if (payload.typ !== 'access') return false;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
