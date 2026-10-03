/**
 * @vitest-environment jsdom
 *
 * Compact roster on the game card ticket: players drawn as seats, empty seats
 * as dashed circles, big rosters summarised as "+N".
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameParticipant } from '@/types';
import { GameCardSeatStack } from './GameCardSeatStack';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const players = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    userId: `u${i}`,
    role: 'PLAYER',
    status: 'PLAYING',
    joinedAt: '',
    user: { id: `u${i}`, firstName: `F${i}`, lastName: `L${i}` },
  })) as unknown as GameParticipant[];

function render(props: Partial<React.ComponentProps<typeof GameCardSeatStack>>) {
  act(() => {
    root.render(
      <GameCardSeatStack
        participants={players(3)}
        maxParticipants={4}
        standingMedalMode="podium"
        attendanceRail={null}
        {...props}
      />,
    );
  });
  const stack = container.firstElementChild as HTMLElement;
  return {
    seats: stack.children.length,
    empty: stack.querySelectorAll('.border-dashed').length,
    text: stack.textContent ?? '',
    stack,
  };
}

describe('GameCardSeatStack', () => {
  it('draws one dashed seat per open place on a small game', () => {
    const { seats, empty } = render({});
    expect(seats).toBe(4);
    expect(empty).toBe(1);
  });

  it('summarises a big roster as +N and draws no empty seats', () => {
    const { empty, text } = render({ participants: players(12), maxParticipants: 16 });
    expect(empty).toBe(0);
    expect(text).toContain('+8');
  });

  it('has no seats for entities without a seat count', () => {
    const { empty } = render({ participants: players(2), maxParticipants: null });
    expect(empty).toBe(0);
  });

  it('marks the viewer and finished-game places', () => {
    const { stack, text } = render({ viewerId: 'u1', placeByUserId: { u0: 1, u1: 2 } });
    expect(stack.children[1].className).toContain('ring-primary-500');
    expect(text).toContain('1');
    expect(text).toContain('2');
  });
});
