/**
 * PRD 361 — pure ordering and selection rules for "Played with".
 * Run: ts-node --transpile-only src/services/user/coPlay.rank.test.ts
 */
import assert from 'node:assert/strict';
import { CO_PLAY_TOP_LIMIT, pickTopCoPlayerIds, rankInvitablePlayers } from './coPlay.service';

const row = (
  id: string,
  lastPlayedTogetherAt: string | null,
  gamesTogetherCount: number,
  interactionCount: number,
) => ({ id, lastPlayedTogetherAt, gamesTogetherCount, interactionCount });

// Recency wins over every other signal.
{
  const ranked = rankInvitablePlayers([
    row('tapped-a-lot', null, 0, 99),
    row('old-partner', '2026-01-10T18:00:00Z', 9, 0),
    row('recent-partner', '2026-09-20T18:00:00Z', 1, 0),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['recent-partner', 'old-partner', 'tapped-a-lot'],
    'most recent shared game first, never-played last regardless of taps',
  );
}

// NULLS LAST: a high tap count does not beat any co-player.
{
  const ranked = rankInvitablePlayers([
    row('never-played-high-taps', null, 0, 500),
    row('played-once', '2025-11-01T10:00:00Z', 1, 0),
  ]);
  assert.equal(ranked[0].id, 'played-once');
}

// Same recency → more shared games first; same again → more taps first.
{
  const ranked = rankInvitablePlayers([
    row('same-day-few-games', '2026-09-01T10:00:00Z', 2, 50),
    row('same-day-many-games', '2026-09-01T10:00:00Z', 6, 0),
    row('same-day-same-games-more-taps', '2026-09-01T10:00:00Z', 2, 80),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['same-day-many-games', 'same-day-same-games-more-taps', 'same-day-few-games'],
  );
}

// Stable among never-played rows: the input (interaction) order is preserved on full ties.
{
  const ranked = rankInvitablePlayers([row('x', null, 0, 3), row('y', null, 0, 3), row('z', null, 0, 3)]);
  assert.deepEqual(ranked.map((r) => r.id), ['x', 'y', 'z']);
}

// Date objects and ISO strings rank the same; invalid dates are treated as never played.
{
  const ranked = rankInvitablePlayers([
    { id: 'iso', lastPlayedTogetherAt: '2026-05-01T00:00:00Z', gamesTogetherCount: 1, interactionCount: 0 },
    { id: 'date', lastPlayedTogetherAt: new Date('2026-06-01T00:00:00Z'), gamesTogetherCount: 1, interactionCount: 0 },
    { id: 'garbage', lastPlayedTogetherAt: 'not-a-date', gamesTogetherCount: 1, interactionCount: 9 },
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ['date', 'iso', 'garbage']);
}

// Top pick: skips excluded (participants, busy, blocked, self) and caps at the limit.
{
  const rows = Array.from({ length: 15 }, (_, i) => ({ userId: `u${i}` }));
  const picked = pickTopCoPlayerIds(rows, new Set(['u0', 'u3']));
  assert.equal(picked.length, CO_PLAY_TOP_LIMIT);
  assert.equal(picked[0], 'u1');
  assert.ok(!picked.includes('u0') && !picked.includes('u3'));
  assert.equal(picked[CO_PLAY_TOP_LIMIT - 1], 'u11');
  assert.deepEqual(pickTopCoPlayerIds([], new Set()), []);
  assert.deepEqual(pickTopCoPlayerIds(rows, new Set(), 2), ['u0', 'u1']);
}

console.log('coPlay rank: recency-first order, NULLS LAST, tiebreakers, top pick passed');
