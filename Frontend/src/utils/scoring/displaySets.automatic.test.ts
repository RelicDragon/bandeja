import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  expandSetsForDisplay,
  shouldAppendSetAfterUpdate,
  trimTrailingEmptyAfterDecision,
} from './displaySets';
import { getRules } from './rulebook';
import { getStandingsMatchOutcome } from './matchWinnerLive';

/** Mirrors useSetEntryOperations post-save set pipeline. */
function pipelineAfterSetUpdate(
  workingSets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: 'OFFICIAL' }>,
  rules: ReturnType<typeof getRules>
) {
  let nextSets = workingSets.map((s) => ({ role: 'OFFICIAL' as const, ...s }));
  const appended = shouldAppendSetAfterUpdate(nextSets, rules);
  if (appended) nextSets = [...nextSets, appended];
  const outcome = getStandingsMatchOutcome(nextSets, rules);
  if (outcome !== null) {
    nextSets = trimTrailingEmptyAfterDecision(nextSets, rules);
  }
  return { nextSets, outcome, appended };
}

describe('CLASSIC_AUTOMATIC set entry slots', () => {
  const rules = getRules({ sport: Sports.PADEL, scoringPreset: 'CLASSIC_AUTOMATIC' } as never);

  it('after a winning first set, entry pipeline keeps a second 0:0 slot', () => {
    const working = [
      { teamA: 6, teamB: 4, role: 'OFFICIAL' as const },
      { teamA: 0, teamB: 0, role: 'OFFICIAL' as const },
    ];
    const { nextSets, outcome } = pipelineAfterSetUpdate(working, rules);

    // Standings may still treat one set as deciding who is ahead.
    expect(outcome).toBe('A');

    // But results entry must still allow set 2 (and later STB at 1-1).
    expect(nextSets.map((s) => [s.teamA, s.teamB])).toEqual([
      [6, 4],
      [0, 0],
    ]);
  });

  it('expandSetsForDisplay shows 0:0 after a single won set when editing', () => {
    const display = expandSetsForDisplay([{ teamA: 6, teamB: 4, role: 'OFFICIAL' }], rules, {
      canEditResults: true,
    });
    expect(display.some((s) => s.teamA === 0 && s.teamB === 0)).toBe(true);
  });

  it('draw first set still keeps a second slot (control — currently works)', () => {
    const working = [
      { teamA: 6, teamB: 6, role: 'OFFICIAL' as const },
      { teamA: 0, teamB: 0, role: 'OFFICIAL' as const },
    ];
    const { nextSets } = pipelineAfterSetUpdate(working, rules);
    expect(nextSets.map((s) => [s.teamA, s.teamB])).toEqual([
      [6, 6],
      [0, 0],
    ]);
  });

  it('after 1-1, entry pipeline keeps STB 0:0 slot', () => {
    const working = [
      { teamA: 6, teamB: 4, role: 'OFFICIAL' as const },
      { teamA: 4, teamB: 6, role: 'OFFICIAL' as const },
    ];
    const { nextSets } = pipelineAfterSetUpdate(working, rules);
    expect(nextSets.length).toBeGreaterThanOrEqual(3);
    expect(nextSets[2]).toMatchObject({ teamA: 0, teamB: 0, isTieBreak: true });
  });
});
