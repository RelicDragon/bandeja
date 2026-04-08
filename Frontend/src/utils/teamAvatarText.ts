import type { BasicUser } from '@/types';

export function userInitialsFromBasicUser(user: BasicUser): string {
  const a = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  return a || '?';
}

export function teamNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase() || '?';
  }
  const w = name.trim();
  if (w.length >= 2) return w.slice(0, 2).toUpperCase();
  return (w[0] ?? '?').toUpperCase();
}
