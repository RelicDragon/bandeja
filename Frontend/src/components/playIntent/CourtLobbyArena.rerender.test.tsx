// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolMember } from '@/api/playIntents';

const counters = vi.hoisted(() => ({ pulseRenders: 0 }));
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/playIntent/CourtLobbyPulseRing', () => ({
  CourtLobbyPulseRing: () => {
    counters.pulseRenders += 1;
    return null;
  },
}));

vi.mock('@/components/playIntent/CourtLobbySportCourt', () => ({
  CourtLobbySportCourt: () => null,
}));

vi.mock('@/components/playIntent/CourtLobbyThunder', () => ({
  CourtLobbyThunder: () => null,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (
    selector: (state: {
      user: {
        id: string;
        firstName: string;
        lastName: string;
        avatar: null;
      };
    }) => unknown,
  ) =>
    selector({
      user: {
        id: 'viewer',
        firstName: 'Viewer',
        lastName: 'Player',
        avatar: null,
      },
    }),
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (
    selector: (state: { isFavorite: () => boolean }) => unknown,
  ) => selector({ isFavorite: () => false }),
}));

const members: PoolMember[] = [
  {
    userId: 'u1',
    intentId: 'i1',
    firstName: 'One',
    lastName: 'Player',
    avatar: null,
    level: 3,
    affinity: 'near',
    affinityScore: 7,
    status: 'OPEN',
    busyInGame: false,
    inProposal: false,
    eligibleForProposal: true,
  },
  {
    userId: 'u2',
    intentId: 'i2',
    firstName: 'Two',
    lastName: 'Player',
    avatar: null,
    level: 3.5,
    affinity: 'mid',
    affinityScore: 3,
    status: 'OPEN',
    busyInGame: false,
    inProposal: false,
    eligibleForProposal: false,
  },
];

function positionFromTransform(transform: string) {
  const match = transform.match(
    /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)/,
  );
  if (!match) throw new Error(`Unexpected avatar transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function positiveAngleDelta(from: number, to: number) {
  return (to - from + Math.PI * 2) % (Math.PI * 2);
}

function arenaOrbitAngle(position: { x: number; y: number }) {
  const centerX = 330 * 0.5;
  const centerY = 330 * 0.54;
  return Math.atan2((position.y - centerY) / 0.74, position.x - centerX);
}

describe('CourtLobbyArena refresh stability', () => {
  afterEach(() => {
    counters.pulseRenders = 0;
    vi.unstubAllGlobals();
  });

  it('does not re-render for a semantically identical cloned pool snapshot', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);
    const onAvatarClick = vi.fn();
    const props = {
      members,
      overflow: 0,
      busy: false,
      hasProposal: true,
      vacancy: 1,
      rosterLocked: false,
      sport: 'PADEL' as const,
      partySize: 4,
      onAvatarClick,
    };

    await act(async () => {
      root.render(<CourtLobbyArena {...props} />);
    });
    expect(container.querySelector('.court-lobby-arena__avatar-readd')).not.toBeNull();
    const rendersAfterFirstSnapshot = counters.pulseRenders;

    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={members.map((member) => ({ ...member }))}
        />,
      );
    });

    expect(counters.pulseRenders).toBe(rendersAfterFirstSnapshot);

    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={members.map((member, index) =>
            index === 1
              ? { ...member, eligibleForProposal: true }
              : { ...member },
          )}
        />,
      );
    });

    expect(counters.pulseRenders).toBeGreaterThan(rendersAfterFirstSnapshot);

    await act(async () => {
      root.render(<CourtLobbyArena {...props} vacancy={0} />);
    });
    expect(container.querySelector('.court-lobby-arena__avatar-readd')).toBeNull();

    await act(async () => root.unmount());
  });

  it('re-renders when a far member\'s mismatch reason changes, but not for an identical clone', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);
    const farMembers: PoolMember[] = [
      {
        userId: 'u3',
        intentId: 'i3',
        firstName: 'Far',
        lastName: 'Player',
        avatar: null,
        level: 4,
        affinity: 'far',
        affinityScore: 0,
        status: 'OPEN',
        busyInGame: false,
        inProposal: false,
        eligibleForProposal: false,
        mismatch: { reason: 'time', period: 'EVENING' },
      },
    ];
    const props = {
      overflow: 0,
      busy: false,
      hasProposal: true,
      vacancy: 1,
      rosterLocked: false,
      sport: 'PADEL' as const,
      partySize: 4,
      onAvatarClick: vi.fn(),
    };

    await act(async () => {
      root.render(<CourtLobbyArena {...props} members={farMembers} />);
    });
    const rendersAfterFirstSnapshot = counters.pulseRenders;

    // Semantically identical clone (same mismatch) must NOT trigger a re-render.
    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={farMembers.map((member) => ({ ...member, mismatch: { ...member.mismatch! } }))}
        />,
      );
    });
    expect(counters.pulseRenders).toBe(rendersAfterFirstSnapshot);

    // A change in the mismatch reason MUST trigger a re-render — this is the
    // clause added to `membersKey` / `arenaMembersEqual` for the bubble feature.
    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={farMembers.map((member) => ({
            ...member,
            mismatch: { reason: 'level' as const },
          }))}
        />,
      );
    });
    expect(counters.pulseRenders).toBeGreaterThan(rendersAfterFirstSnapshot);

    await act(async () => root.unmount());
  });

  it('positions moving avatars with compositor transforms', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CourtLobbyArena
          members={members}
          overflow={0}
          busy={false}
          hasProposal
          vacancy={1}
          rosterLocked={false}
          sport="PADEL"
          partySize={4}
          onAvatarClick={vi.fn()}
        />,
      );
    });

    const avatar = container.querySelector<HTMLButtonElement>(
      '.court-lobby-arena__avatar',
    );
    expect(avatar?.style.transform).toContain('translate3d');
    const initialTransform = avatar?.style.transform;

    await act(async () => {
      nextFrame?.(16.67);
    });
    expect(avatar?.style.transform).toContain('translate3d');
    expect(avatar?.style.transform).not.toBe(initialTransform);
    expect(avatar?.style.left).toBe('0px');
    expect(avatar?.style.top).toBe('0px');

    await act(async () => root.unmount());
  });

  it('keeps add/remove handoff frames composited and settles within 500ms', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    let nextFrame: FrameRequestCallback | undefined;
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback;
      frameId += 1;
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);
    const props = {
      overflow: 0,
      busy: false,
      hasProposal: true,
      vacancy: 1,
      rosterLocked: false,
      sport: 'PADEL' as const,
      partySize: 4,
      onAvatarClick: vi.fn(),
    };

    await act(async () => {
      root.render(<CourtLobbyArena {...props} members={members} />);
    });

    const avatar = container.querySelector<HTMLButtonElement>(
      '.court-lobby-arena__avatar',
    );
    if (!avatar) throw new Error('Expected a court avatar');
    const avatarVisual = avatar.querySelector<HTMLElement>(
      '.court-lobby-arena__avatar-visual',
    );
    if (!avatarVisual) throw new Error('Expected a composited avatar visual');
    const start = positionFromTransform(avatar.style.transform);
    const initialWidth = avatar.style.width;
    const initialVisualTransform = avatarVisual.style.transform;

    const selectedMembers = members.map((member, index) =>
      index === 0
        ? { ...member, inProposal: true, eligibleForProposal: false }
        : member,
    );
    await act(async () => {
      root.render(<CourtLobbyArena {...props} members={selectedMembers} />);
    });

    expect.soft(avatar.style.width).not.toBe(initialWidth);
    expect.soft(avatar.style.scale).toBe('');
    expect.soft(avatarVisual.style.transform).not.toBe(initialVisualTransform);

    const firstHalfSecondTransforms: string[] = [];
    await act(async () => {
      for (let frame = 1; frame <= 30; frame += 1) {
        nextFrame?.(frame * (1000 / 60));
        firstHalfSecondTransforms.push(avatar.style.transform);
      }
    });
    const atHalfSecond = positionFromTransform(avatar.style.transform);

    await act(async () => {
      for (let frame = 31; frame <= 180; frame += 1) {
        nextFrame?.(frame * (1000 / 60));
      }
    });
    const settled = positionFromTransform(avatar.style.transform);
    const totalDistance = distance(start, settled);
    const halfSecondProgress = distance(start, atHalfSecond) / totalDistance;

    expect(new Set(firstHalfSecondTransforms).size).toBeGreaterThanOrEqual(29);
    expect(halfSecondProgress).toBeGreaterThanOrEqual(0.85);

    const selectedVisualTransform = avatarVisual.style.transform;
    await act(async () => {
      root.render(<CourtLobbyArena {...props} members={members} />);
    });
    expect.soft(avatar.style.width).toBe(initialWidth);
    expect.soft(avatar.style.scale).toBe('');
    expect
      .soft(avatarVisual.style.transform)
      .not.toBe(selectedVisualTransform);

    const removeTransforms: string[] = [];
    await act(async () => {
      for (let frame = 181; frame <= 210; frame += 1) {
        nextFrame?.(frame * (1000 / 60));
        removeTransforms.push(avatar.style.transform);
      }
    });
    const removeAtHalfSecond = positionFromTransform(avatar.style.transform);

    await act(async () => {
      for (let frame = 211; frame <= 360; frame += 1) {
        nextFrame?.(frame * (1000 / 60));
      }
    });
    const removeSettled = positionFromTransform(avatar.style.transform);
    const removeDistance = distance(settled, removeSettled);
    const removeHalfSecondProgress =
      distance(settled, removeAtHalfSecond) / removeDistance;

    expect(new Set(removeTransforms).size).toBeGreaterThanOrEqual(29);
    expect(removeHalfSecondProgress).toBeGreaterThanOrEqual(0.85);

    await act(async () => root.unmount());
  });

  it('keeps selected players and the viewer on fixed party-size orbit slots', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    const selectedMembers = members.map((member) => ({
      ...member,
      inProposal: true,
      eligibleForProposal: false,
    }));
    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CourtLobbyArena
          members={selectedMembers}
          overflow={0}
          busy={false}
          hasProposal
          vacancy={1}
          rosterLocked={false}
          sport="PADEL"
          partySize={4}
          onAvatarClick={vi.fn()}
        />,
      );
    });

    const selfMarker = container.querySelector<HTMLElement>(
      '.court-lobby-arena__self-marker',
    );
    const avatars = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '.court-lobby-arena__avatar',
      ),
    ];
    if (!selfMarker || avatars.length !== 2) {
      throw new Error('Expected the viewer and two selected court players');
    }

    const selfAngle = arenaOrbitAngle(
      positionFromTransform(selfMarker.style.transform),
    );
    const firstPlayerAngle = arenaOrbitAngle(
      positionFromTransform(avatars[0].style.transform),
    );
    const secondPlayerAngle = arenaOrbitAngle(
      positionFromTransform(avatars[1].style.transform),
    );

    expect(positiveAngleDelta(selfAngle, firstPlayerAngle)).toBeCloseTo(
      Math.PI / 2,
      3,
    );
    expect(positiveAngleDelta(selfAngle, secondPlayerAngle)).toBeCloseTo(
      Math.PI,
      3,
    );
    expect(avatars.every((avatar) => avatar.style.scale === '')).toBe(true);
    expect(
      avatars.every(
        (avatar) =>
          avatar.querySelector('.court-lobby-arena__avatar-visual') !== null,
      ),
    ).toBe(true);

    await act(async () => root.unmount());
  });
});
