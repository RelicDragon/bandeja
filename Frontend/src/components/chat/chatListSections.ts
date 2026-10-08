import type { Game } from '@/types';
import { getChatKey } from '@/utils/chatListHelpers';
import { isChatListInvitation } from '@/utils/chatListInvitation';
import type { ChatItem } from './chatListTypes';

/** Quick filter chips above the Chats feed (`chatsFilter === 'users'`). */
export type ChatListKind = 'all' | 'games' | 'groups';

export type ChatListSectionId = 'nextUp' | 'invitations' | 'chats' | 'upcoming' | 'past';

export type GameChatItem = Extract<ChatItem, { type: 'game' }>;

export type ChatListEntry =
  | { kind: 'header'; key: string; section: ChatListSectionId }
  | { kind: 'hero'; key: string; chat: GameChatItem }
  | { kind: 'chat'; key: string; chat: ChatItem; past?: boolean }
  | { kind: 'findGame'; key: string }
  /** "Show N more" / "Show less" under the first invitation. */
  | { kind: 'moreInvites'; key: string; hidden: number; expanded: boolean };

/** Invitations shown before the "Show N more" row. */
export const CHAT_LIST_INVITES_COLLAPSED = 1;

export type ChatListEntriesOptions = { invitesExpanded?: boolean };

/** Soonest first, so the one invitation left visible is the most urgent. */
function invitationEntries(unsorted: GameChatItem[], expanded: boolean): ChatListEntry[] {
  const invites = [...unsorted].sort((a, b) => startMs(a) - startMs(b));
  if (invites.length <= CHAT_LIST_INVITES_COLLAPSED) return invites.map((c) => row(c));
  const shown = expanded ? invites : invites.slice(0, CHAT_LIST_INVITES_COLLAPSED);
  return [
    ...shown.map((c) => row(c)),
    {
      kind: 'moreInvites',
      key: 'section:more-invites',
      hidden: invites.length - CHAT_LIST_INVITES_COLLAPSED,
      expanded,
    },
  ];
}

/** How far ahead a game may be to become the "Next up" card. */
export const CHAT_LIST_NEXT_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function myParticipant(game: Game, userId: string | undefined) {
  if (!userId) return undefined;
  return game.participants?.find((p) => p.userId === userId);
}

export { isChatListInvitation };

/** Finished, or its slot has ended without the game being started. */
export function isChatListPastGame(game: Game, now: number): boolean {
  if (game.status === 'FINISHED' || game.status === 'ARCHIVED') return true;
  if (game.status === 'STARTED') return false;
  if (game.timeIsSet !== true) return false;
  const end = new Date(game.endTime || game.startTime).getTime();
  return Number.isFinite(end) && end < now;
}

function isNextUpCandidate(game: Game, userId: string | undefined, now: number): boolean {
  if (game.entityType === 'LEAGUE_SEASON') return false;
  if (game.timeIsSet !== true) return false;
  if (myParticipant(game, userId)?.status !== 'PLAYING') return false;
  if (isChatListPastGame(game, now)) return false;
  const start = new Date(game.startTime).getTime();
  return Number.isFinite(start) && start <= now + CHAT_LIST_NEXT_UP_WINDOW_MS;
}

function startMs(chat: GameChatItem): number {
  if (chat.data.timeIsSet !== true) return Number.POSITIVE_INFINITY;
  const t = new Date(chat.data.startTime).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function header(section: ChatListSectionId): ChatListEntry {
  return { kind: 'header', key: `section:${section}`, section };
}

function row(chat: ChatItem, past?: boolean): ChatListEntry {
  return past ? { kind: 'chat', key: getChatKey(chat), chat, past } : { kind: 'chat', key: getChatKey(chat), chat };
}

export function countChatListInvitations(chats: readonly ChatItem[], userId: string | undefined): number {
  let n = 0;
  for (const c of chats) if (c.type === 'game' && isChatListInvitation(c.data, userId)) n += 1;
  return n;
}

/**
 * Turns the Chats feed into sectioned list entries.
 *
 * - `all`: "Next up" (nearest game the viewer plays in this week), "Invitations",
 *   then every other chat in feed order.
 * - Invitations collapse to the first one plus a "Show N more" row unless expanded.
 * - `games`: invitations, upcoming by start time, past by recency, then a Find prompt.
 * - `groups`: group chats and channels in feed order, no headers.
 */
export function buildChatListEntries(
  chats: readonly ChatItem[],
  kind: ChatListKind,
  userId: string | undefined,
  now: number = Date.now(),
  { invitesExpanded = false }: ChatListEntriesOptions = {}
): ChatListEntry[] {
  if (kind === 'groups') {
    return chats.filter((c) => c.type === 'group' || c.type === 'channel').map((c) => row(c));
  }

  if (kind === 'games') {
    const games = chats.filter((c): c is GameChatItem => c.type === 'game');
    const invites = games.filter((c) => isChatListInvitation(c.data, userId));
    const past = games
      .filter((c) => !invites.includes(c) && isChatListPastGame(c.data, now))
      .sort((a, b) => startMs(b) - startMs(a));
    const upcoming = games
      .filter((c) => !invites.includes(c) && !past.includes(c))
      .sort((a, b) => startMs(a) - startMs(b));
    const out: ChatListEntry[] = [];
    if (invites.length) out.push(header('invitations'), ...invitationEntries(invites, invitesExpanded));
    if (upcoming.length) out.push(header('upcoming'), ...upcoming.map((c) => row(c)));
    if (past.length) out.push(header('past'), ...past.map((c) => row(c, true)));
    out.push({ kind: 'findGame', key: 'section:find-game' });
    return out;
  }

  let hero: GameChatItem | null = null;
  for (const c of chats) {
    if (c.type !== 'game' || !isNextUpCandidate(c.data, userId, now)) continue;
    if (!hero || startMs(c) < startMs(hero)) hero = c;
  }
  const invites = chats.filter(
    (c): c is GameChatItem => c !== hero && c.type === 'game' && isChatListInvitation(c.data, userId)
  );
  const rest = chats.filter((c) => c !== hero && !invites.includes(c as GameChatItem));

  const out: ChatListEntry[] = [];
  if (hero) out.push(header('nextUp'), { kind: 'hero', key: getChatKey(hero), chat: hero });
  if (invites.length) out.push(header('invitations'), ...invitationEntries(invites, invitesExpanded));
  if ((hero || invites.length) && rest.length) out.push(header('chats'));
  out.push(...rest.map((c) => row(c)));
  return out;
}
