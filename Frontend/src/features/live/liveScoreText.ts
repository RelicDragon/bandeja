import type { TFunction } from 'i18next';
import type { LiveRailMatchPosition } from '@/api/live';
import type { LiveGameSummary } from '@/types';
import { formatSetScores, sidePlayerNames } from './liveSummaryUpdate';

/**
 * PRD 349 — the human strings a live score renders, shared by the rail card
 * and the game-details Live block so the two never phrase the same game
 * differently.
 */

/** "Just started" / "Started 23 min ago" / "Started 11 h ago". */
export function liveStartedLabel(t: TFunction, minutes: number | null): string {
  if (minutes === null || minutes < 1) return t('live.startedJustNow');
  if (minutes < 60) return t('live.started', { count: minutes });
  return t('live.startedHours', { count: Math.floor(minutes / 60) });
}

/** "Just finished" / "Finished 23 min ago" / "Finished 3 h ago". */
export function liveFinishedLabel(t: TFunction, minutes: number | null): string {
  if (minutes === null || minutes < 1) return t('live.finishedJustNow');
  if (minutes < 60) return t('live.finished', { count: minutes });
  return t('live.finishedHours', { count: Math.floor(minutes / 60) });
}

/** "Match 3/3" for a game with a scoreline, "Round 4" for a standings format. */
export function matchPositionLabel(
  t: TFunction,
  position: LiveRailMatchPosition | null | undefined,
): string | null {
  if (!position) return null;
  if (position.kind === 'round') return t('live.tournamentRound', { round: position.round });
  return t('live.matchOf', { index: position.index, count: position.count });
}

/**
 * "Marko and Ana lead 6–4, 3–2" — the whole score as one sentence for screen
 * readers. The conjunction is localized (Chinese and Japanese use their own
 * list separators, not a word).
 */
export function liveScoreLabel(
  t: TFunction,
  summary: LiveGameSummary,
  finished = false,
): string {
  const [sideA, sideB] = summary.sides;
  const namesA = sidePlayerNames(sideA).join(t('live.andJoin'));
  const namesB = sidePlayerNames(sideB).join(t('live.andJoin'));
  const score = formatSetScores(summary);
  // In progress with nothing entered yet: who is on court, no score.
  if (!score) return t('live.scorePending', { sideA: namesA, sideB: namesB });
  const key = finished ? 'live.scoreWon' : 'live.scoreLead';
  if (sideA.leading) return t(key, { leaders: namesA, score });
  if (sideB.leading) return t(key, { leaders: namesB, score });
  return t('live.scoreLevel', { sideA: namesA, sideB: namesB, score });
}
