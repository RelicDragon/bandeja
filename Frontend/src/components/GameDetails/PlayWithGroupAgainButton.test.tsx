/**
 * @vitest-environment jsdom
 *
 * PRD 362 — "Play with this group again".
 *
 * What must hold: the button exists for a PLAYING participant of a FINAL GAME,
 * TOURNAMENT, TRAINING or BAR and for the trainer of a FINAL TRAINING; it does
 * not exist for EVENT / LEAGUE / LEAGUE_SEASON, for spectators, or before
 * results are FINAL; and tapping it opens `/create-game` with a draft that has
 * no schedule, no court, no booking, and the previous roster as *invitees*
 * (never the viewer). The caption is wired as the button's description.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, GameParticipant } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const navigate = vi.fn();
let viewer: { id: string; nameIsSet: boolean } | null = { id: 'me', nameIsSet: true };
const runWithProfileName = vi.fn((action: () => void) => action());

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/store/authStore', () => {
  const useAuthStore = (selector: (s: { user: typeof viewer }) => unknown) =>
    selector({ user: viewer });
  useAuthStore.getState = () => ({ user: viewer });
  return { useAuthStore };
});

vi.mock('@/utils/runWithProfileName', () => ({
  runWithProfileName: (action: () => void) => runWithProfileName(action),
}));

vi.mock('@/sport/sportRegistry', () => ({
  getSportConfig: () => ({ labelKey: 'sports.padel' }),
}));

const { PlayWithGroupAgainButton } = await import('./PlayWithGroupAgainButton');

function participant(
  userId: string,
  status: GameParticipant['status'],
  role: GameParticipant['role'] = 'PARTICIPANT',
): GameParticipant {
  return {
    userId,
    status,
    role,
    joinedAt: '2026-09-01T00:00:00.000Z',
    user: { id: userId, firstName: userId, level: 3, socialLevel: 3 },
  } as GameParticipant;
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: 'PADEL',
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    startTime: '2026-09-20T10:00:00.000Z',
    endTime: '2026-09-20T11:30:00.000Z',
    clubId: 'club-1',
    courtId: 'court-7',
    hasBookedCourt: true,
    maxParticipants: 4,
    playersPerMatch: 4,
    participants: [
      participant('me', 'PLAYING', 'OWNER'),
      participant('ana', 'PLAYING'),
      participant('marko', 'PLAYING'),
      participant('queued', 'IN_QUEUE'),
    ],
    ...overrides,
  } as unknown as Game;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  viewer = { id: 'me', nameIsSet: true };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(game: Game) {
  act(() => {
    root.render(<PlayWithGroupAgainButton game={game} />);
  });
  return container.querySelector<HTMLButtonElement>('[data-testid="play-with-group-again"]');
}

describe('PlayWithGroupAgainButton', () => {
  it.each(['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const)(
    'renders the new label for a PLAYING participant of a FINAL %s',
    (entityType) => {
      const button = render(makeGame({ entityType }));
      expect(button).not.toBeNull();
      expect(button!.textContent).toContain('gameResults.playWithGroupAgainCta');
      expect(button!.textContent).not.toContain('playAgainCta');
    },
  );

  it.each(['EVENT', 'LEAGUE', 'LEAGUE_SEASON'] as const)('is absent for %s', (entityType) => {
    expect(render(makeGame({ entityType }))).toBeNull();
  });

  it('is absent before results are FINAL', () => {
    expect(render(makeGame({ resultsStatus: 'NONE' }))).toBeNull();
    expect(render(makeGame({ resultsStatus: 'IN_PROGRESS' }))).toBeNull();
  });

  it('is absent for a spectator, a queued player and a signed-out viewer', () => {
    viewer = { id: 'stranger', nameIsSet: true };
    expect(render(makeGame())).toBeNull();
    viewer = { id: 'queued', nameIsSet: true };
    expect(render(makeGame())).toBeNull();
    viewer = null;
    expect(render(makeGame())).toBeNull();
  });

  it('describes the button with the caption', () => {
    const button = render(makeGame())!;
    const captionId = button.getAttribute('aria-describedby');
    expect(captionId).toBeTruthy();
    expect(container.querySelector(`[id="${captionId}"]`)?.textContent).toBe(
      'gameResults.playWithGroupAgainCaption',
    );
  });

  it('opens create with a fresh schedule and the old roster as invitees, not the viewer', () => {
    const button = render(makeGame({ name: 'Tuesday regulars' }))!;
    act(() => button.click());

    expect(navigate).toHaveBeenCalledTimes(1);
    const [path, options] = navigate.mock.calls[0] as [string, { state: Record<string, unknown> }];
    expect(path).toBe('/create-game');
    const state = options.state;
    expect(state.entityType).toBe('GAME');
    expect(state.invitedPlayerIds).toEqual(['ana', 'marko']);
    expect((state.invitedPlayers as Array<{ id: string }>).map((p) => p.id)).toEqual([
      'ana',
      'marko',
    ]);
    expect(state.invitedTrainerId).toBeNull();
    expect(state.creatorNonPlaying).toBe(false);
    expect(state.rematchOf).toEqual({ gameId: 'g1', title: 'Tuesday regulars' });

    const draft = state.initialGameData as Record<string, unknown>;
    expect(draft.clubId).toBe('club-1');
    expect(draft.timeIsSet).toBe(false);
    for (const key of ['startTime', 'endTime', 'courtId', 'hasBookedCourt', 'participants', 'id']) {
      expect(draft[key], key).toBeUndefined();
    }
  });

  it('falls back to the sport label as the draft title when the game had no name', () => {
    const button = render(makeGame({ name: '   ' }))!;
    act(() => button.click());
    const [, options] = navigate.mock.calls[0] as [string, { state: { rematchOf: { title: string } } }];
    expect(options.state.rematchOf.title).toBe('sports.padel');
  });

  it('TRAINING: the trainer gets the button and opens a non-playing draft without inviting themself', () => {
    viewer = { id: 'coach', nameIsSet: true };
    const button = render(
      makeGame({
        entityType: 'TRAINING',
        trainerId: 'coach',
        participants: [
          participant('coach', 'NON_PLAYING', 'OWNER'),
          participant('ana', 'PLAYING'),
          participant('marko', 'PLAYING'),
        ],
      }),
    );
    expect(button).not.toBeNull();
    act(() => button!.click());
    const [, options] = navigate.mock.calls[0] as [string, { state: Record<string, unknown> }];
    expect(options.state.creatorNonPlaying).toBe(true);
    expect(options.state.invitedPlayerIds).toEqual(['ana', 'marko']);
    expect(options.state.invitedTrainerId).toBeNull();
  });

  it('TRAINING: a trainee re-invites the trainer as trainer', () => {
    viewer = { id: 'ana', nameIsSet: true };
    const button = render(
      makeGame({
        entityType: 'TRAINING',
        trainerId: 'coach',
        participants: [
          participant('coach', 'NON_PLAYING', 'OWNER'),
          participant('ana', 'PLAYING'),
          participant('marko', 'PLAYING'),
        ],
      }),
    )!;
    act(() => button.click());
    const [, options] = navigate.mock.calls[0] as [string, { state: Record<string, unknown> }];
    expect(options.state.invitedTrainerId).toBe('coach');
    expect(options.state.invitedPlayerIds).toEqual(['marko', 'coach']);
    expect(options.state.creatorNonPlaying).toBe(false);
  });

  it('routes through the profile-name gate when the viewer has no name yet', () => {
    viewer = { id: 'me', nameIsSet: false };
    const button = render(makeGame())!;
    act(() => button.click());
    expect(runWithProfileName).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
