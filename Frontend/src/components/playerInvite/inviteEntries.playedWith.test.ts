import { describe, expect, it } from 'vitest';
import type { BasicUser, UserTeam } from '@/types';
import { Sports } from '@shared/sport';
import type { UserMetadata } from '@/store/playersStore';
import { groupInviteEntries, PLAYED_WITH_CAP, type InviteListEntry } from './inviteEntries';
import { buildInviteListRows } from './inviteListRows';

function user(id: string, sportsEnabled = [Sports.PADEL]): BasicUser {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    level: 3,
    socialLevel: 1,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
    sportsEnabled,
  };
}

const entry = (u: BasicUser): InviteListEntry => ({ kind: 'user', id: u.id, user: u });

function metaLookup(meta: Record<string, Partial<UserMetadata>>) {
  return (id: string): UserMetadata | undefined =>
    meta[id]
      ? { interactionCount: 0, gamesTogetherCount: 0, lastFetchedAt: 0, ...meta[id] }
      : undefined;
}

describe('groupInviteEntries (PRD 361)', () => {
  it('puts co-players first by recency, then games, then taps, and keeps the rest in list order', () => {
    const entries = [user('tapped'), user('old'), user('recent'), user('sameDayFewGames'), user('sameDayManyGames')].map(entry);
    const groups = groupInviteEntries(entries, {
      query: '',
      getUserMetadata: metaLookup({
        tapped: { interactionCount: 99 },
        old: { lastPlayedTogetherAt: '2026-01-01T10:00:00Z', gamesTogetherCount: 9 },
        recent: { lastPlayedTogetherAt: '2026-09-20T10:00:00Z', gamesTogetherCount: 1 },
        sameDayFewGames: { lastPlayedTogetherAt: '2026-06-01T10:00:00Z', gamesTogetherCount: 2, interactionCount: 5 },
        sameDayManyGames: { lastPlayedTogetherAt: '2026-06-01T10:00:00Z', gamesTogetherCount: 4 },
      }),
    });
    expect(groups.playedWith.map((e) => e.id)).toEqual(['recent', 'sameDayManyGames', 'sameDayFewGames', 'old']);
    expect(groups.everyone.map((e) => e.id)).toEqual(['tapped']);
  });

  it('caps Played with at ten and leaves the eleventh in Everyone', () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry(user(`u${i}`)));
    const meta: Record<string, Partial<UserMetadata>> = {};
    entries.forEach((e, i) => {
      meta[e.id] = { lastPlayedTogetherAt: new Date(Date.UTC(2026, 0, 30 - i)).toISOString(), gamesTogetherCount: 1 };
    });
    const groups = groupInviteEntries(entries, { query: '', getUserMetadata: metaLookup(meta) });
    expect(groups.playedWith).toHaveLength(PLAYED_WITH_CAP);
    expect(groups.playedWith[0].id).toBe('u0');
    expect(groups.everyone.map((e) => e.id)).toEqual(['u10', 'u11']);
  });

  it('omits co-players who do not have the game sport enabled', () => {
    const entries = [entry(user('padelOnly', [Sports.PADEL])), entry(user('both', [Sports.PADEL, Sports.TENNIS]))];
    const getUserMetadata = metaLookup({
      padelOnly: { lastPlayedTogetherAt: '2026-09-01T10:00:00Z', gamesTogetherCount: 3 },
      both: { lastPlayedTogetherAt: '2026-08-01T10:00:00Z', gamesTogetherCount: 1 },
    });
    const groups = groupInviteEntries(entries, { query: '', gameSport: Sports.TENNIS, getUserMetadata });
    expect(groups.playedWith.map((e) => e.id)).toEqual(['both']);
    expect(groups.everyone.map((e) => e.id)).toEqual(['padelOnly']);
  });

  it('never qualifies a row on tap count alone, and ignores unparsable recency', () => {
    const entries = [entry(user('taps')), entry(user('garbage'))];
    const groups = groupInviteEntries(entries, {
      query: '',
      getUserMetadata: metaLookup({
        taps: { interactionCount: 500, gamesTogetherCount: 0 },
        garbage: { lastPlayedTogetherAt: 'not-a-date', gamesTogetherCount: 2 },
      }),
    });
    expect(groups.playedWith).toEqual([]);
    expect(groups.everyone).toBe(entries);
  });

  it('collapses the groups as soon as there is any query text', () => {
    const entries = [entry(user('recent'))];
    const getUserMetadata = metaLookup({ recent: { lastPlayedTogetherAt: '2026-09-20T10:00:00Z', gamesTogetherCount: 1 } });
    expect(groupInviteEntries(entries, { query: 'a', getUserMetadata }).playedWith).toEqual([]);
    expect(groupInviteEntries(entries, { query: '   ', getUserMetadata }).playedWith).toHaveLength(1);
  });

  it('leaves team rows in Everyone', () => {
    const team = { id: 'team1', name: 'T', size: 2, members: [] } as unknown as UserTeam;
    const entries: InviteListEntry[] = [entry(user('recent')), { kind: 'team', id: 'team1', team, members: [] }];
    const groups = groupInviteEntries(entries, {
      query: '',
      getUserMetadata: metaLookup({ recent: { lastPlayedTogetherAt: '2026-09-20T10:00:00Z', gamesTogetherCount: 1 } }),
    });
    expect(groups.playedWith.map((e) => e.id)).toEqual(['recent']);
    expect(groups.everyone.map((e) => e.kind)).toEqual(['team']);
  });
});

describe('buildInviteListRows', () => {
  const labels = { playedWith: 'Played with', everyone: 'Everyone in Belgrade' };

  it('returns the plain list with no headers when nobody was played with', () => {
    const everyone = [entry(user('a')), entry(user('b'))];
    expect(buildInviteListRows({ playedWith: [], everyone }, labels)).toBe(everyone);
  });

  it('adds one heading per non-empty group with its count', () => {
    const rows = buildInviteListRows(
      { playedWith: [entry(user('p'))], everyone: [entry(user('a')), entry(user('b'))] },
      labels,
    );
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual([
      'header:played-with',
      'user:p',
      'header:everyone',
      'user:a',
      'user:b',
    ]);
    expect(rows[0]).toMatchObject({ label: 'Played with', count: 1 });
    expect(rows[2]).toMatchObject({ label: 'Everyone in Belgrade', count: 2 });
  });

  it('skips the Everyone heading when every row was played with', () => {
    const rows = buildInviteListRows({ playedWith: [entry(user('p'))], everyone: [] }, labels);
    expect(rows.map((r) => r.kind)).toEqual(['header', 'user']);
  });
});
