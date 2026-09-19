// @vitest-environment jsdom
import { act, memo, useCallback, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import { gameCardPropsEqual, type GameCardMemoProps } from '@/utils/gameCardPropsEqual';

/**
 * Guards the Find/My card-list render contract: a refetch replaces the games
 * array (and every `Game` object in it) with equal-valued copies, and the tab
 * re-renders for unrelated reasons many times a minute. Cards must only repaint
 * when their own data changes — which holds exactly while the handlers the tab
 * passes down keep a stable identity, because `gameCardPropsEqual` compares
 * `onJoin`/`onNoteSaved` by reference.
 */

const renderCard = vi.fn();

const FakeGameCard = memo(function FakeGameCard(props: GameCardMemoProps) {
  renderCard(props.game.id);
  return <span data-testid={props.game.id}>{props.game.name}</span>;
}, gameCardPropsEqual);

function makeGames(count: number, namePrefix = 'Game'): Game[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `g${index}`,
    name: `${namePrefix} ${index}`,
    entityType: 'GAME',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    status: 'ANNOUNCED',
    startTime: '2026-05-21T17:00:00.000Z',
    endTime: '2026-05-21T19:00:00.000Z',
    maxParticipants: 4,
    isPublic: true,
    affectsRating: true,
    resultsStatus: 'NONE',
    participants: [],
  })) as Game[];
}

const viewer = { id: 'viewer' };

/** Mirrors the tab: `games` is refetched into new objects on every tick. */
function CardList({ handlerMode, games }: { handlerMode: 'stable' | 'unstable'; games: Game[] }) {
  const gamesRef = useRef(games);
  gamesRef.current = games;

  // `stable` is the shipped shape: the lists are read through a ref so the
  // callback never changes identity. `unstable` reproduces the regression.
  const stableJoin = useCallback(() => gamesRef.current.length, []);
  const unstableJoin = () => games.length;
  const onJoin = handlerMode === 'stable' ? stableJoin : unstableJoin;

  return (
    <div>
      {games.map((game) => (
        <FakeGameCard key={game.id} game={game} user={viewer} onJoin={onJoin} />
      ))}
    </div>
  );
}

function Host({ handlerMode }: { handlerMode: 'stable' | 'unstable' }) {
  const [, forceRender] = useState(0);
  const [games, setGames] = useState(() => makeGames(12));
  hostControls = {
    // A parent re-render with no data change (unread tick, bookings poll, URL).
    rerender: () => forceRender((n) => n + 1),
    // A refetch: same content, brand new objects.
    refetchIdentical: () => setGames(makeGames(12)),
    // A real change to one card.
    renameFirst: () =>
      setGames((prev) => prev.map((g, i) => (i === 0 ? { ...g, name: 'Renamed' } : g))),
  };
  return <CardList handlerMode={handlerMode} games={games} />;
}

let hostControls: {
  rerender: () => void;
  refetchIdentical: () => void;
  renameFirst: () => void;
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
  renderCard.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
});

it('keeps cards mounted-but-idle across parent renders and identical refetches', () => {
  act(() => root.render(<Host handlerMode="stable" />));
  expect(renderCard).toHaveBeenCalledTimes(12);
  renderCard.mockClear();

  act(() => hostControls.rerender());
  expect(renderCard).not.toHaveBeenCalled();

  // New array + new Game objects with identical content: still no repaint.
  act(() => hostControls.refetchIdentical());
  expect(renderCard).not.toHaveBeenCalled();
});

it('repaints only the card whose data actually changed', () => {
  act(() => root.render(<Host handlerMode="stable" />));
  renderCard.mockClear();

  act(() => hostControls.renameFirst());
  expect(renderCard.mock.calls).toEqual([['g0']]);
  expect(container.querySelector('[data-testid="g0"]')?.textContent).toBe('Renamed');
});

it('re-renders every card when the join handler identity churns', () => {
  // The pre-fix FindTab shape: `onJoin` closed over the game lists, so each
  // refetch handed all cards a new function and defeated their memo.
  act(() => root.render(<Host handlerMode="unstable" />));
  renderCard.mockClear();

  act(() => hostControls.refetchIdentical());
  expect(renderCard).toHaveBeenCalledTimes(12);
});
