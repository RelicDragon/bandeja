import type { GroupChannelParticipant } from '@/api/chat';
import type { Game, GameParticipant } from '@/types';
import type { GroupChannel } from '@/api/chat';

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function enrichParticipantsWithUsers(
  primary: GameParticipant[],
  userSources: GameParticipant[]
): GameParticipant[] {
  if (primary.length === 0) return userSources;

  const usersByUserId = new Map<string, GameParticipant['user']>();
  for (const participant of userSources) {
    if (participant.user) usersByUserId.set(participant.userId, participant.user);
  }

  const enriched = primary.map((participant) =>
    participant.user
      ? participant
      : { ...participant, user: usersByUserId.get(participant.userId) ?? participant.user }
  );

  if (enriched.some((participant) => participant.user)) return enriched;
  return userSources.length > 0 ? userSources : primary;
}

function participantUserSources(game: Game): GameParticipant[] {
  return [...asArray(game.participants), ...asArray(game.parent?.participants)];
}

/** Prefer API list when non-empty; never let an empty API response wipe embedded roster. */
export function resolveGameMentionParticipants(
  game: Game,
  fetched: GameParticipant[] | null | undefined
): GameParticipant[] {
  const embedded = asArray(game.participants);
  const enrichPool = participantUserSources(game);
  const fromApi = asArray(fetched);

  if (fromApi.length > 0) {
    const resolved = enrichParticipantsWithUsers(fromApi, enrichPool);
    if (resolved.some((participant) => participant.user)) return resolved;
  }

  if (embedded.length > 0) return embedded;

  if (game.parentId) {
    const parent = asArray(game.parent?.participants);
    if (parent.length > 0) return parent;
  }

  if (fromApi.length > 0) return fromApi;

  return [];
}

export function resolveGroupMentionParticipants(
  groupChannel: GroupChannel,
  fetched: GroupChannelParticipant[] | null | undefined
): GroupChannelParticipant[] {
  const embedded = asArray(groupChannel.participants);
  const fromApi = asArray(fetched);
  if (fromApi.length > 0) {
    if (fromApi.some((participant) => participant.user)) return fromApi;
    return embedded.length > 0 ? embedded : fromApi;
  }
  return embedded;
}

/** react-mentions only queries suggestions on select; nudge after value changes. */
export function nudgeMentionSuggestionQuery(
  textarea: HTMLTextAreaElement | null | undefined,
  options?: { requireFocus?: boolean }
): void {
  if (!textarea) return;
  if (options?.requireFocus !== false && document.activeElement !== textarea) return;
  textarea.dispatchEvent(new Event('select', { bubbles: true }));
}
