// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';
import type { LiveScoringClassicState, LiveScoringState } from '@/utils/liveScoring';
import { getRules } from '@/utils/scoring';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

import { LiveTvScoreboard, type LiveTvScoreboardProps } from './LiveTvScoreboard';

const player = (id: string, firstName: string, lastName: string) =>
  ({ id, firstName, lastName, level: 0, socialLevel: 0, gender: 'MALE', approvedLevel: false, isTrainer: false }) as BasicUser;

const teamA = [player('a1', 'Marko', 'Petrovic'), player('a2', 'Ana', 'Jovic')];
const teamB = [player('b1', 'Luka', 'Ilic'), player('b2', 'Ivan', 'Kos')];

const classic = (extra: Partial<LiveScoringClassicState> = {}): LiveScoringClassicState => ({
  pointState: { kind: 'regular', teamA: 30, teamB: 15 },
  withinSetTieBreak: false,
  tieBreakA: 0,
  tieBreakB: 0,
  classicPointsPlayedInGame: 3,
  deuceCount: 0,
  ...extra,
});

const state = (extra: Partial<LiveScoringState> = {}): LiveScoringState => ({
  activeSetIndex: 1,
  mode: 'classic',
  sets: [
    { teamA: 6, teamB: 4 },
    { teamA: 3, teamB: 2 },
  ],
  classic: classic(),
  ...extra,
});

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function render(props: Partial<LiveTvScoreboardProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <LiveTvScoreboard
        state={state()}
        rules={getRules(null)}
        teamAPlayers={teamA}
        teamBPlayers={teamB}
        boardTheme="dark"
        matchDecided={false}
        setTitle="Set 2"
        {...props}
      />,
    ),
  );
  return container;
}

const rowCells = (container: HTMLElement, rowIndex: number) =>
  Array.from(container.querySelectorAll('tbody tr')[rowIndex].querySelectorAll('td')).map((td) => td.textContent);

describe('LiveTvScoreboard', () => {
  it('reads like a tennis scoreboard: a column per set, then the game points', () => {
    const container = render();
    const headers = Array.from(container.querySelectorAll('thead th[scope="col"]')).map((th) => th.textContent);
    expect(headers.slice(1)).toEqual(['1', '2', 'gameDetails.liveScoring.game']);
    expect(rowCells(container, 0)).toEqual(['6', '3', '30']);
    expect(rowCells(container, 1)).toEqual(['4', '2', '15']);
    expect(container.querySelector('tbody tr th')?.textContent).toContain('Marko Petrovic');
    expect(container.querySelector('tbody tr th')?.textContent).toContain('Ana Jovic');
  });

  it('marks exactly one server', () => {
    const container = render({ serveIndicator: { serverTeam: 'teamB', serverPlayerIndex: 1 } });
    const balls = container.querySelectorAll('[aria-label="live.board.serving"]');
    expect(balls).toHaveLength(1);
    expect(balls[0].parentElement?.textContent).toContain('Ivan Kos');
  });

  it('drops the points column and the server once the match is decided', () => {
    const container = render({ matchDecided: true, serveIndicator: { serverTeam: 'teamA', serverPlayerIndex: 0 } });
    expect(rowCells(container, 0)).toEqual(['6', '3']);
    expect(container.textContent).not.toContain('gameDetails.liveScoring.game');
    expect(container.querySelector('[aria-label="live.board.serving"]')).toBeNull();
  });

  it('labels deuce, advantage and golden point', () => {
    // What the engine actually stores at 40–40 with golden point off.
    const level = render({ state: state({ classic: classic({ pointState: { kind: 'regular', teamA: 40, teamB: 40 } }) }) });
    expect(level.textContent).toContain('live.board.deuce');
    expect(level.textContent).not.toContain('live.board.goldenPoint');
    expect(render({ state: state({ classic: classic({ pointState: { kind: 'deuce' } }) }) }).textContent).toContain(
      'live.board.deuce',
    );
    expect(
      render({ state: state({ classic: classic({ pointState: { kind: 'advantage', side: 'teamA' } }) }) }).textContent,
    ).toContain('live.board.advantage');
    const gp = render({
      state: state({ classic: classic({ pointState: { kind: 'regular', teamA: 40, teamB: 40 } }) }),
      rules: { ...getRules(null), deucesBeforeGoldenPoint: 0 },
    });
    expect(gp.textContent).toContain('live.board.goldenPoint');
  });

  it('shows tie-break points under a TB header', () => {
    const container = render({
      state: state({ classic: classic({ withinSetTieBreak: true, tieBreakA: 5, tieBreakB: 4 }) }),
    });
    expect(container.querySelector('thead')?.textContent).toContain('gameDetails.liveScoring.tieBreakShort');
    expect(rowCells(container, 0).at(-1)).toBe('5');
    expect(container.textContent).toContain('live.board.tieBreak');
  });

  it('shows no game column in points mode', () => {
    const container = render({ state: state({ mode: 'points', classic: undefined }) });
    expect(container.textContent).not.toContain('gameDetails.liveScoring.game');
    expect(rowCells(container, 0)).toEqual(['6', '3']);
  });
});
