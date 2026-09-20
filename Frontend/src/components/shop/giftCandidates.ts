import type { BasicUser } from '@/types';

/**
 * PRD 355 — who to offer first in the gift picker.
 *
 * Followers rank above the people the giver follows (a follower already opted
 * into the relationship), duplicates collapse to their highest rank, and the
 * search term is a plain case-insensitive substring over the full name so
 * typing never needs a round trip.
 */
export function rankGiftCandidates(
  followers: BasicUser[],
  following: BasicUser[],
  search: string,
): BasicUser[] {
  const seen = new Set<string>();
  const ordered: BasicUser[] = [];

  for (const user of [...followers, ...following]) {
    if (!user?.id || seen.has(user.id)) continue;
    seen.add(user.id);
    ordered.push(user);
  }

  const term = search.trim().toLowerCase();
  if (!term) return ordered;

  return ordered.filter((user) =>
    `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().toLowerCase().includes(term),
  );
}

/** The display name used in the gift confirmation. */
export function giftRecipientName(user: BasicUser): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}
