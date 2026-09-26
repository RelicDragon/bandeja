/**
 * PRD 349 — compact live-score payload for the "Live now" rail.
 *
 * Pure derivation from the live-scoring envelope that already lives in
 * `Match.metadata.liveScoring` (`services/results/matchLiveScoring.types.ts`).
 * No prisma, no env — so it is unit-testable and safe to import from the
 * Telegram bot, the Find enricher and the tests alike.
 *
 * The resulting shape is fixed by CONTRACT §5.6 / the wave-2 scaffold: it is
 * mirrored byte-for-byte in `Frontend/src/types/gameCardEnrichment.ts`.
 */
import type { BasicUser } from '../../types/user.types';
import { isLiveScoringEnvelopeV1 } from '../results/matchLiveScoring.types';
import type { LiveGameSummary, LiveGameSummarySide } from './availableGamesEnrichmentTypes';

/** One row of `state.sets`, normalised out of the free-form Json blob. */
export type LiveSummarySetRow = {
  teamA: number;
  teamB: number;
  isTieBreak: boolean;
};

export type LiveSummaryTeamInput = {
  teamNumber: number;
  players: BasicUser[];
};

export type LiveSummaryMatchInput = {
  matchId: string;
  /** `Match.metadata` — the envelope is read out of `.liveScoring`. */
  metadata: unknown;
  courtName?: string | null;
  /** When the live board started; rendered as "Started 23 min ago". */
  startedAt?: Date | string | null;
  teams: LiveSummaryTeamInput[];
};

const MAX_SET_VALUE = 9999;

function clampScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SET_VALUE, Math.trunc(n)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `state.sets`, normalised. Empty array when the blob carries nothing usable. */
export function readLiveSummarySets(state: unknown): LiveSummarySetRow[] {
  const o = asRecord(state);
  if (!o || !Array.isArray(o.sets)) return [];
  return o.sets.map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      teamA: clampScore(row.teamA),
      teamB: clampScore(row.teamB),
      isTieBreak: Boolean(row.isTieBreak),
    };
  });
}

/** 0-based index of the set currently being played, clamped into `sets`. */
export function readActiveSetIndex(state: unknown, setCount: number): number {
  const o = asRecord(state);
  const raw = Number(o?.activeSetIndex);
  if (!Number.isFinite(raw)) return Math.max(0, setCount - 1);
  return Math.max(0, Math.min(Math.trunc(raw), Math.max(0, setCount - 1)));
}

/**
 * Point score inside the current game, as two already-rendered strings.
 *
 * `classic` mode carries the tennis point state; `points` mode (americano and
 * friends) has no sub-game score at all, so both sides render empty and the
 * card shows only the set pills.
 */
export function readCurrentGameScores(state: unknown): [string, string] {
  const classic = asRecord(asRecord(state)?.classic);
  if (!classic) return ['', ''];

  if (classic.withinSetTieBreak === true) {
    return [String(clampScore(classic.tieBreakA)), String(clampScore(classic.tieBreakB))];
  }

  const point = asRecord(classic.pointState);
  if (!point) return ['', ''];

  if (point.kind === 'deuce') return ['40', '40'];
  if (point.kind === 'advantage') {
    return point.side === 'teamB' ? ['40', 'AD'] : ['AD', '40'];
  }
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

/**
 * Which side is ahead: sets won first, then games in the running set, then the
 * point inside the current game. `0` means level — neither side glows.
 */
export function leadingTeamNumber(
  sets: LiveSummarySetRow[],
  activeSetIndex: number,
  currentScores: [string, string],
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

  const point = comparePointScore(currentScores[0], currentScores[1]);
  if (point !== 0) return point > 0 ? 1 : 2;
  return 0;
}

function sideFor(
  teamNumber: 1 | 2,
  teams: LiveSummaryTeamInput[],
  sets: LiveSummarySetRow[],
  activeSetIndex: number,
  currentScores: [string, string],
  leading: 0 | 1 | 2,
): LiveGameSummarySide {
  const team = teams.find((x) => x.teamNumber === teamNumber);
  const visible = sets.slice(0, activeSetIndex + 1);
  return {
    teamNumber,
    players: team?.players ?? [],
    setScores: visible.map((s) => (teamNumber === 1 ? s.teamA : s.teamB)),
    currentGameScore: currentScores[teamNumber - 1],
    leading: leading === teamNumber,
  };
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Build the rail payload for one match, or `null` when the match carries no
 * usable live state (never scored, cleared, or a legacy unstructured blob).
 *
 * `revision` comes straight off the envelope and **must** be propagated: the
 * rail drops any socket frame whose revision is not greater than the one it is
 * already showing, so a late frame can never overwrite a newer score.
 */
export function buildLiveGameSummary(input: LiveSummaryMatchInput): LiveGameSummary | null {
  const metadata = asRecord(input.metadata);
  const envelope = metadata?.liveScoring;
  if (!isLiveScoringEnvelopeV1(envelope)) return null;

  const state = envelope.state;
  const sets = readLiveSummarySets(state);
  if (sets.length === 0) return null;

  const activeSetIndex = readActiveSetIndex(state, sets.length);
  const currentScores = readCurrentGameScores(state);
  const leading = leadingTeamNumber(sets, activeSetIndex, currentScores);

  return {
    matchId: input.matchId,
    courtName: input.courtName ?? null,
    currentSet: activeSetIndex + 1,
    sides: [
      sideFor(1, input.teams, sets, activeSetIndex, currentScores, leading),
      sideFor(2, input.teams, sets, activeSetIndex, currentScores, leading),
    ],
    startedAt: toIsoOrNull(input.startedAt),
    revision: envelope.revision,
  };
}

/** Envelope `updatedAt` as epoch ms, for picking the freshest live match of a game. */
export function liveEnvelopeUpdatedAtMs(metadata: unknown): number {
  const envelope = asRecord(metadata)?.liveScoring;
  if (!isLiveScoringEnvelopeV1(envelope)) return 0;
  const parsed = Date.parse(envelope.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** "Marko and Ana lead 6–4, 3–2" style set string, e.g. `6-4 3-2`. */
export function formatSetScoreLine(summary: LiveGameSummary, separator = ' '): string {
  const [a, b] = summary.sides;
  const count = Math.min(a.setScores.length, b.setScores.length);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(`${a.setScores[i]}-${b.setScores[i]}`);
  }
  return parts.join(separator);
}

export type FinalSummaryMatchInput = {
  matchId: string;
  courtName?: string | null;
  startedAt?: Date | string | null;
  teams: LiveSummaryTeamInput[];
  /** OFFICIAL `Set` rows, oldest first. `teamAScore` is team 1. */
  sets: Array<{ teamAScore: number; teamBScore: number }>;
  /** `Match.winnerId` resolved to its team number, when stored. */
  winnerTeamNumber?: number | null;
};

/**
 * Rail payload for a match whose results went **final** — the same shape as a
 * live summary so one card renders both. Built from the `Set` rows, which are
 * the source of truth for manual entry and live scoring alike.
 *
 * `currentGameScore` is empty (nothing is being played) and `leading` marks
 * the winner: `Match.winnerId` when stored, otherwise sets won, otherwise
 * games won. `revision` stays unset — a finished card never takes a socket
 * frame. `null` when there is no scored set or not exactly two sides.
 */
export function buildFinalGameSummary(input: FinalSummaryMatchInput): LiveGameSummary | null {
  const sets = input.sets
    .map((row) => ({
      teamA: clampScore(row.teamAScore),
      teamB: clampScore(row.teamBScore),
      isTieBreak: false,
    }))
    .filter((row) => row.teamA > 0 || row.teamB > 0);
  if (sets.length === 0) return null;
  if (!input.teams.some((x) => x.teamNumber === 1) || !input.teams.some((x) => x.teamNumber === 2)) {
    return null;
  }

  let winner: 0 | 1 | 2 =
    input.winnerTeamNumber === 1 || input.winnerTeamNumber === 2 ? input.winnerTeamNumber : 0;
  if (winner === 0) {
    const lastIndex = sets.length;
    winner = leadingTeamNumber(sets, lastIndex, ['', '']);
    if (winner === 0) {
      const gamesA = sets.reduce((sum, row) => sum + row.teamA, 0);
      const gamesB = sets.reduce((sum, row) => sum + row.teamB, 0);
      if (gamesA !== gamesB) winner = gamesA > gamesB ? 1 : 2;
    }
  }

  const lastIndex = sets.length - 1;
  return {
    matchId: input.matchId,
    courtName: input.courtName ?? null,
    currentSet: sets.length,
    sides: [
      sideFor(1, input.teams, sets, lastIndex, ['', ''], winner),
      sideFor(2, input.teams, sets, lastIndex, ['', ''], winner),
    ],
    startedAt: toIsoOrNull(input.startedAt),
  };
}
