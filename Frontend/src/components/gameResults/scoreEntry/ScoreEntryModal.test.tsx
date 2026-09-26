// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/types/gameResults';
import type { BasicUser } from '@/types';
import { ScoreEntryModal } from './ScoreEntryModal';
import type { ScoreEntryGame } from './useScoreEntryState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.team ? `${key}:${options.team}` : key),
  }),
}));
vi.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./ScoreEntryHeader', () => ({ ScoreEntryHeader: () => null }));
vi.mock('./ScoreEntryBoard', () => ({ ScoreEntryBoard: () => null }));
vi.mock('./ScoreKeypadPanel', () => ({ ScoreKeypadPanel: () => null }));

const bestOf3: ScoreEntryGame = {
  sport: 'PADEL', scoringPreset: 'CLASSIC_BEST_OF_3', fixedNumberOfSets: 3,
  maxTotalPointsPerSet: 0, maxPointsPerTeam: 0, winnerOfMatch: 'BY_SETS',
  ballsInGames: true, deucesBeforeGoldenPoint: null, pointsPerTie: 0,
};

const players = [
  { id: 'a1', firstName: 'Ana' },
  { id: 'a2', firstName: 'Leo' },
  { id: 'b1', firstName: 'Mia' },
  { id: 'b2', firstName: 'Tom' },
] as BasicUser[];

describe('score entry dialog when the score ends the match', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  function render(sets: Match['sets'], setIndex: number, hasOtherMatchToScore = false, game = bestOf3) {
    const match: Match = { id: 'm1', teamA: ['a1', 'a2'], teamB: ['b1', 'b2'], sets };
    act(() =>
      root.render(
        <ScoreEntryModal
          isOpen
          match={match}
          setIndex={setIndex}
          players={players}
          layout="stacked"
          game={game}
          autoOpenKeypad={false}
          onSave={vi.fn()}
          onSaveAndNext={vi.fn()}
          hasOtherMatchToScore={hasOtherMatchToScore}
          onClose={vi.fn()}
        />,
      ),
    );
  }

  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
  const hint = () => container.querySelector('[role="status"]')?.textContent ?? null;

  it('hides save-and-next and names the winners after 6–4 6–4', () => {
    render([{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 4 }], 1);
    expect(buttons()).not.toContain('gameResults.saveAndNext');
    expect(buttons()).toContain('common.save');
    expect(hint()).toBe('gameResults.scoreEntryMatchWon:Ana · Leo');
  });

  it('keeps save-and-next for a third set after 6–4 4–6', () => {
    render([{ teamA: 6, teamB: 4 }, { teamA: 4, teamB: 6 }], 1);
    expect(buttons()).toContain('gameResults.saveAndNext');
    expect(hint()).toBeNull();
  });

  it('names the winners of a deciding third set', () => {
    render([{ teamA: 6, teamB: 4 }, { teamA: 4, teamB: 6 }, { teamA: 3, teamB: 6 }], 2);
    expect(buttons()).not.toContain('gameResults.saveAndNext');
    expect(hint()).toBe('gameResults.scoreEntryMatchWon:Mia · Tom');
  });

  it('still moves on to another match that is ready to score', () => {
    render([{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 4 }], 1, true);
    expect(buttons()).toContain('gameResults.saveAndNext');
    expect(hint()).toBe('gameResults.scoreEntryMatchWon:Ana · Leo');
  });

  it('leaves Automatic (flexible) scoring open for more sets', () => {
    render([{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 4 }], 1, false, {
      ...bestOf3,
      scoringPreset: 'CLASSIC_AUTOMATIC',
      fixedNumberOfSets: 0,
    });
    expect(buttons()).toContain('gameResults.saveAndNext');
    expect(hint()).toBeNull();
  });
});
