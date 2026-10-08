import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import type { ChatItem } from './chatListTypes';
import { buildChatListEntries, countChatListInvitations, isChatListPastGame } from './chatListSections';

const ME = 'me';
const NOW = Date.parse('2026-10-08T12:00:00Z');
const H = 60 * 60 * 1000;

function game(id: string, opts: { start: number; status?: Game['status']; mine?: string; timeIsSet?: boolean }): ChatItem {
  const data = {
    id,
    entityType: 'GAME',
    status: opts.status ?? 'ANNOUNCED',
    timeIsSet: opts.timeIsSet ?? true,
    startTime: new Date(opts.start).toISOString(),
    endTime: new Date(opts.start + H).toISOString(),
    participants: opts.mine ? [{ userId: ME, role: 'PARTICIPANT', status: opts.mine, joinedAt: '', user: { id: ME } }] : [],
  } as unknown as Game;
  return { type: 'game', data, lastMessageDate: null, unreadCount: 0 };
}

function group(id: string): ChatItem {
  return { type: 'group', data: { id } as never, lastMessageDate: null, unreadCount: 0 };
}

function user(id: string): ChatItem {
  return { type: 'user', data: { id } as never, lastMessageDate: null, unreadCount: 0 };
}

const keys = (entries: ReturnType<typeof buildChatListEntries>) => entries.map((e) => e.key);

describe('buildChatListEntries — all', () => {
  it('lifts the nearest playing game into Next up and invitations above the feed', () => {
    const later = game('later', { start: NOW + 48 * H, mine: 'PLAYING' });
    const soon = game('soon', { start: NOW + 5 * H, mine: 'PLAYING' });
    const invite = game('inv', { start: NOW + 24 * H, mine: 'INVITED' });
    const chats = [group('g1'), later, invite, user('u1'), soon];

    expect(keys(buildChatListEntries(chats, 'all', ME, NOW))).toEqual([
      'section:nextUp',
      'game-soon',
      'section:invitations',
      'game-inv',
      'section:chats',
      'group-g1',
      'game-later',
      'user-u1',
    ]);
  });

  it('adds no headers when there is nothing to lift', () => {
    const far = game('far', { start: NOW + 10 * 24 * H, mine: 'PLAYING' });
    expect(keys(buildChatListEntries([group('g1'), far], 'all', ME, NOW))).toEqual(['group-g1', 'game-far']);
  });

  it('never lifts a game without a set time, an ended one, or one the viewer is not playing', () => {
    const chats = [
      game('tbd', { start: NOW + H, mine: 'PLAYING', timeIsSet: false }),
      game('ended', { start: NOW - 5 * H, mine: 'PLAYING' }),
      game('queue', { start: NOW + H, mine: 'IN_QUEUE' }),
    ];
    expect(buildChatListEntries(chats, 'all', ME, NOW).some((e) => e.kind === 'hero')).toBe(false);
  });

  it('keeps a started game as Next up', () => {
    const live = game('live', { start: NOW - 2 * H, status: 'STARTED', mine: 'PLAYING' });
    expect(buildChatListEntries([live], 'all', ME, NOW)[1]).toMatchObject({ kind: 'hero', key: 'game-live' });
  });
});

describe('buildChatListEntries — invitation cap', () => {
  const invites = [
    game('i1', { start: NOW + 2 * H, mine: 'INVITED' }),
    game('i2', { start: NOW + 3 * H, mine: 'INVITED' }),
    game('i3', { start: NOW + 4 * H, mine: 'INVITED' }),
  ];

  it('shows the soonest invitation and a "Show N more" row', () => {
    const entries = buildChatListEntries([invites[2]!, invites[0]!, invites[1]!, group('g1')], 'all', ME, NOW);
    expect(keys(entries)).toEqual([
      'section:invitations',
      'game-i1',
      'section:more-invites',
      'section:chats',
      'group-g1',
    ]);
    expect(entries[2]).toMatchObject({ kind: 'moreInvites', hidden: 2, expanded: false });
  });

  it('lists every invitation when expanded, with a collapse row', () => {
    const entries = buildChatListEntries(invites, 'games', ME, NOW, { invitesExpanded: true });
    expect(keys(entries).slice(0, 5)).toEqual([
      'section:invitations',
      'game-i1',
      'game-i2',
      'game-i3',
      'section:more-invites',
    ]);
    expect(entries[4]).toMatchObject({ kind: 'moreInvites', expanded: true });
  });

  it('adds no toggle for a single invitation', () => {
    const entries = buildChatListEntries([invites[0]!], 'all', ME, NOW);
    expect(entries.some((e) => e.kind === 'moreInvites')).toBe(false);
  });
});

describe('buildChatListEntries — games', () => {
  it('orders upcoming by start, past by recency, and ends with the Find prompt', () => {
    const chats = [
      group('g1'),
      game('b', { start: NOW + 48 * H, mine: 'PLAYING' }),
      game('a', { start: NOW + 2 * H, mine: 'PLAYING' }),
      game('old', { start: NOW - 72 * H, status: 'FINISHED', mine: 'PLAYING' }),
      game('older', { start: NOW - 96 * H, status: 'FINISHED', mine: 'PLAYING' }),
      game('inv', { start: NOW + 24 * H, mine: 'INVITED' }),
    ];
    const entries = buildChatListEntries(chats, 'games', ME, NOW);
    expect(keys(entries)).toEqual([
      'section:invitations',
      'game-inv',
      'section:upcoming',
      'game-a',
      'game-b',
      'section:past',
      'game-old',
      'game-older',
      'section:find-game',
    ]);
    expect(entries.find((e) => e.key === 'game-old')).toMatchObject({ past: true });
  });
});

describe('buildChatListEntries — groups', () => {
  it('keeps only group chats and channels', () => {
    const channel: ChatItem = { type: 'channel', data: { id: 'c1' } as never, lastMessageDate: null, unreadCount: 0 };
    const chats = [user('u1'), group('g1'), game('x', { start: NOW + H }), channel];
    expect(keys(buildChatListEntries(chats, 'groups', ME, NOW))).toEqual(['group-g1', 'channel-c1']);
  });
});

describe('helpers', () => {
  it('counts only answerable invitations', () => {
    const chats = [
      game('a', { start: NOW + H, mine: 'INVITED' }),
      game('b', { start: NOW + H, mine: 'INVITED', status: 'STARTED' }),
      game('c', { start: NOW + H, mine: 'PLAYING' }),
    ];
    expect(countChatListInvitations(chats, ME)).toBe(1);
  });

  it('treats an announced game whose slot ended as past', () => {
    const g = game('a', { start: NOW - 3 * H }).data as Game;
    expect(isChatListPastGame(g, NOW)).toBe(true);
    expect(isChatListPastGame({ ...g, status: 'STARTED' }, NOW)).toBe(false);
  });
});
