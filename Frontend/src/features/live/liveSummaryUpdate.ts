import type { LiveGameSummary, LiveGameSummarySide } from '@/types';

/**
 * PRD 349 — apply a `match-live-scoring-updated` socket frame to a rail card.
 *
 * Mirrors `Backend/src/services/game/liveGameSummary.ts` so a card can update
 * without a refetch. Two invariants, both load-bearing:
 *
 *  1. **Revision monotonicity.** The envelope carries a monotonic `revision`.
 *     A frame whose revision is not strictly greater than what the card is
 *     already showing is dropped, so a late frame can never overwrite a newer
 *     score. This is why `revision` is propagated all the way from
 *     `Match.metadata.liveScoring` into the card payload.
 *  2. **Freeze, never blank.** Anything unreadable returns the *previous*
 *     summary untouched. On socket loss the card keeps the last score and
 *     shows a "Reconnecting" caption instead of emptying itself.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(9999, Math.trunc(n)));
}

export interface LiveSummarySetRow {
  teamA: number;
  teamB: number;
}

/** `revision` off a raw `liveScoring` envelope, or `null` when unreadable. */
export function readEnvelopeRevision(liveScoring: unknown): number | null {
  const envelope = asRecord(liveScoring);
  const revision = envelope?.revision;
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : null;
}

export function readEnvelopeSets(liveScoring: unknown): LiveSummarySetRow[] {
  const state = asRecord(asRecord(liveScoring)?.state);
  if (!state || !Array.isArray(state.sets)) return [];
  return state.sets.map((raw) => {
    const row = asRecord(raw) ?? {};
    return { teamA: clampScore(row.teamA), teamB: clampScore(row.teamB) };
  });
}

export function readEnvelopeActiveSetIndex(liveScoring: unknown, setCount: number): number {
  const state = asRecord(asRecord(liveScoring)?.state);
  const raw = Number(state?.activeSetIndex);
  if (!Number.isFinite(raw)) return Math.max(0, setCount - 1);
  return Math.max(0, Math.min(Math.trunc(raw), Math.max(0, setCount - 1)));
}

/** Point score inside the current game, already rendered for both sides. */
export function readEnvelopeGameScores(liveScoring: unknown): [string, string] {
  const state = asRecord(asRecord(liveScoring)?.state);
  const classic = asRecord(state?.classic);
  if (!classic) return ['', ''];

  if (classic.withinSetTieBreak === true) {
    return [String(clampScore(classic.tieBreakA)), String(clampScore(classic.tieBreakB))];
  }

  const point = asRecord(classic.pointState);
  if (!point) return ['', ''];
  if (point.kind === 'deuce') return ['40', '40'];
  if (point.kind === 'advantage') return point.side === 'teamB' ? ['40', 'AD'] : ['AD', '40'];
  if (point.kind === 'regular') {
    return [String(clampScore(point.teamA)), String(clampScore(point.teamB))];
  }
  return ['', ''];
}

const POINT_ORDER = ['0', '15', '30', '40', 'AD'];

function comparePointScore(a: string, b: string): number {
  const ai = POINT_ORDER.indexOf(a);
  const bi = POINT_ORDER.indexOf(b);
  if (ai >= 0 && bi >= 0) return ai - bi;
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return 0;
}

/** `0` = level, otherwise the leading side's `teamNumber`. */
export function leadingTeamNumber(
  sets: LiveSummarySetRow[],
  activeSetIndex: number,
  gameScores: [string, string],
): 0 | 1 | 2 {
  let setsA = 0;
  let setsB = 0;
  for (let i = 0; i < activeSetIndex && i < sets.length; i += 1) {
    if (sets[i].teamA > sets[i].teamB) setsA += 1;
    else if (sets[i].teamB > sets[i].teamA) setsB += 1;
  }
  if (setsA !== setsB) return setsA > setsB ? 1 : 2;

  const active = sets[activeSetIndex];
  if (active && active.teamA !== active.teamB) return active.teamA > active.teamB ? 1 : 2;

  const point = comparePointScore(gameScores[0], gameScores[1]);
  if (point !== 0) return point > 0 ? 1 : 2;
  return 0;
}

export interface LiveScoringFrame {
  gameId: string;
  matchId: string;
  liveScoring: unknown;
}

/**
 * Merge a socket frame into a card's summary.
 *
 * Returns the **same object reference** when nothing should change, so a memoised
 * card does not re-render on a dropped frame.
 */
export function applyLiveScoringFrame(
  current: LiveGameSummary,
  frame: LiveScoringFrame,
): LiveGameSummary {
  if (frame.matchId !== current.matchId) return current;

  const revision = readEnvelopeRevision(frame.liveScoring);
  if (revision === null) return current;
  if (typeof current.revision === 'number' && revision <= current.revision) return current;

  const sets = readEnvelopeSets(frame.liveScoring);
  if (sets.length === 0) return current;

  const activeSetIndex = readEnvelopeActiveSetIndex(frame.liveScoring, sets.length);
  const gameScores = readEnvelopeGameScores(frame.liveScoring);
  const leading = leadingTeamNumber(sets, activeSetIndex, gameScores);
  const visible = sets.slice(0, activeSetIndex + 1);

  const nextSide = (side: LiveGameSummarySide, index: 0 | 1): LiveGameSummarySide => ({
    ...side,
    setScores: visible.map((s) => (index === 0 ? s.teamA : s.teamB)),
    currentGameScore: gameScores[index],
    leading: leading === side.teamNumber,
  });

  return {
    ...current,
    currentSet: activeSetIndex + 1,
    sides: [nextSide(current.sides[0], 0), nextSide(current.sides[1], 1)],
    revision,
  };
}

/** Whole minutes since `startedAt`, or `null` when it is missing or unparseable. */
export function minutesSince(startedAt: string | null | undefined, now: number): number | null {
  if (!startedAt) return null;
  const parsed = Date.parse(startedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / 60000));
}

/** `6–4, 3–2` with an en dash, for both the a11y label and the pill row. */
export function formatSetScores(summary: LiveGameSummary): string {
  const [a, b] = summary.sides;
  const count = Math.min(a.setScores.length, b.setScores.length);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) parts.push(`${a.setScores[i]}–${b.setScores[i]}`);
  return parts.join(', ');
}

export function sidePlayerNames(side: LiveGameSummarySide): string[] {
  return side.players.map((p) => p.firstName?.trim() || p.lastName?.trim() || '').filter(Boolean);
}
