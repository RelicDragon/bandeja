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

import { WatchStage, type WatchStageProps } from './WatchStage';

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

function render(props: Partial<WatchStageProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <WatchStage
        state={state()}
        rules={getRules(null)}
        teamAPlayers={teamA}
        teamBPlayers={teamB}
        boardTheme="dark"
        matchDecided={false}
        {...props}
      />,
    ),
  );
  return container;
}

const half = (container: HTMLElement, side: 'teamA' | 'teamB') =>
  container.querySelector<HTMLElement>(`[data-testid="watch-half-${side}"]`)!;

describe('WatchStage', () => {
  it('puts team A at the far end and team B at the near end, each with its own numbers', () => {
    const container = render();
    const far = half(container, 'teamA').textContent;
    const near = half(container, 'teamB').textContent;
    expect(far).toContain('Petrovic');
    expect(far).toContain('63');
    expect(far).toContain('30');
    expect(near).toContain('Ilic');
    expect(near).toContain('42');
    expect(near).toContain('15');
  });

  it('labels the columns once, on the far side: set numbers, then Game', () => {
    const container = render();
    expect(half(container, 'teamA').textContent).toContain('gameDetails.liveScoring.game');
    expect(half(container, 'teamB').textContent).not.toContain('gameDetails.liveScoring.game');
  });

  it('marks the server with the ball', () => {
    const container = render({ serveIndicator: { serverTeam: 'teamB', serverPlayerIndex: 1 } });
    expect(half(container, 'teamA').querySelector('[aria-label="live.board.serving"]')).toBeNull();
    expect(half(container, 'teamB').querySelectorAll('[aria-label="live.board.serving"]')).toHaveLength(1);
  });

  it('shows the point status on the net', () => {
    const container = render({
      state: state({ classic: classic({ pointState: { kind: 'regular', teamA: 40, teamB: 40 } }) }),
    });
    expect(container.textContent).toContain('live.board.deuce');
  });

  it('moves the running total onto the tile in points mode', () => {
    const container = render({ state: { activeSetIndex: 0, mode: 'points', sets: [{ teamA: 14, teamB: 11 }] } });
    expect(half(container, 'teamA').textContent).toContain('gameDetails.liveScoring.points');
    expect(half(container, 'teamA').textContent).toContain('14');
    expect(half(container, 'teamB').textContent).toContain('11');
  });

  it('once decided: final sets, a winner badge, no game points and no serve ball', () => {
    const container = render({
      state: state({
        sets: [
          { teamA: 6, teamB: 4 },
          { teamA: 6, teamB: 3 },
        ],
      }),
      matchDecided: true,
      serveIndicator: { serverTeam: 'teamA', serverPlayerIndex: 0 },
    });
    expect(container.textContent).toContain('gameDetails.liveScoring.matchComplete');
    expect(half(container, 'teamA').textContent).toContain('gameDetails.liveScoring.matchCompleteWinner');
    expect(half(container, 'teamB').textContent).not.toContain('gameDetails.liveScoring.matchCompleteWinner');
    expect(container.textContent).not.toContain('gameDetails.liveScoring.game');
    expect(container.querySelector('[aria-label="live.board.serving"]')).toBeNull();
  });
});
