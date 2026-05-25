export function formatStoryEngagementCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export function displayUserName(user: { firstName?: string | null; lastName?: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}
