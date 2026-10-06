import { describe, expect, it } from 'vitest';
import { toCompactRefs } from '@backend/utils/compactRefs';
import { expandCompactRefs, isCompactRefsPayload } from './compactRefs';

const REF_PROPS = new Set(['user', 'club', 'parent']);

const alice = { id: 'u1', firstName: 'Alice', avatar: 'a.png' };
const bob = { id: 'u2', firstName: 'Bob', avatar: null };
const clubWithCourts = { id: 'c1', name: 'Club', courts: [{ id: 'k1', name: 'Court 1' }] };
const season = { id: 's1', name: 'Season', description: 'long text', leagueSeason: { id: 's1', league: { id: 'l1' } } };

function rounds() {
  return [
    {
      id: 'r1',
      games: [
        {
          id: 'g1',
          club: clubWithCourts,
          parent: season,
          participants: [{ userId: 'u1', user: alice }, { userId: 'u2', user: bob }],
          // Same row selected with fewer fields must not be merged with the full one.
          court: { id: 'k1', club: { id: 'c1', name: 'Club' } },
          startTime: '2026-10-06T18:00:00.000Z',
        },
        {
          id: 'g2',
          club: clubWithCourts,
          parent: season,
          participants: [{ userId: 'u1', user: alice }],
          fixedTeams: [{ players: [{ user: alice }, { user: bob }] }],
          court: null,
        },
      ],
    },
  ];
}

describe('compact refs (backend toCompactRefs ↔ frontend expandCompactRefs)', () => {
  it('round-trips to the original shape', () => {
    const payload = JSON.parse(JSON.stringify(toCompactRefs(rounds(), REF_PROPS)));
    expect(isCompactRefsPayload(payload)).toBe(true);
    expect(expandCompactRefs(payload)).toEqual(rounds());
  });

  it('stores each repeated row once and keeps different selects apart', () => {
    const payload = toCompactRefs(rounds(), REF_PROPS);
    const keys = Object.keys(payload.refs);
    expect(keys.filter((k) => k.startsWith('user:u1:'))).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith('parent:s1:'))).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith('club:c1:'))).toHaveLength(2);
    expect(JSON.stringify(payload).length).toBeLessThan(JSON.stringify(rounds()).length);
  });

  it('shares one expanded object per ref', () => {
    const expanded = expandCompactRefs<ReturnType<typeof rounds>>(toCompactRefs(rounds(), REF_PROPS));
    const [g1, g2] = expanded[0].games;
    expect(g1.parent).toBe(g2.parent);
    expect(g1.participants[0].user).toBe(g2.participants[0].user);
  });

  it('leaves plain payloads alone', () => {
    expect(isCompactRefsPayload(rounds())).toBe(false);
  });
});
