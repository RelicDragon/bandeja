/**
 * PRD 347 — queue position, auto-fill flag and open-seat count.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { readQueueState } from './queueState';
import { joinOutcomeTone } from './joinOutcomeTone';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    maxParticipants: 4,
    autoFillFromQueue: false,
    participants: [
      { userId: 'p1', status: 'PLAYING' },
      { userId: 'p2', status: 'PLAYING' },
      { userId: 'p3', status: 'NON_PLAYING' },
    ],
    joinQueues: [
      { userId: 'b', createdAt: '2026-01-01T11:00:00.000Z' },
      { userId: 'a', createdAt: '2026-01-01T10:00:00.000Z' },
      { userId: 'c', createdAt: '2026-01-01T12:00:00.000Z' },
    ],
    ...overrides,
  } as unknown as Game;
}

describe('readQueueState', () => {
  it('orders the queue by joinedAt and reports a 1-based position', () => {
    const state = readQueueState(makeGame(), 'b');
    expect(state.entries.map((e) => e.userId)).toEqual(['a', 'b', 'c']);
    expect(state.total).toBe(3);
    expect(state.viewerPosition).toBe(2);
  });

  it('returns a null position for someone who is not queued', () => {
    expect(readQueueState(makeGame(), 'p1').viewerPosition).toBeNull();
    expect(readQueueState(makeGame(), undefined).viewerPosition).toBeNull();
  });

  it('counts only PLAYING participants against the cap', () => {
    // 4 seats, 2 PLAYING, 1 NON_PLAYING (a trainer) → 2 open.
    expect(readQueueState(makeGame(), 'a').openSeats).toBe(2);
  });

  it('never reports negative open seats on an over-full roster', () => {
    const overfull = makeGame({
      maxParticipants: 1,
      participants: [
        { userId: 'p1', status: 'PLAYING' },
        { userId: 'p2', status: 'PLAYING' },
      ],
    } as Partial<Game>);
    expect(readQueueState(overfull, 'a').openSeats).toBe(0);
  });

  it('reads the auto-fill flag strictly', () => {
    expect(readQueueState(makeGame(), 'a').autoFillEnabled).toBe(false);
    expect(readQueueState(makeGame({ autoFillFromQueue: true }), 'a').autoFillEnabled).toBe(true);
    expect(
      readQueueState(makeGame({ autoFillFromQueue: undefined }), 'a').autoFillEnabled,
    ).toBe(false);
  });

  it('handles a game with no queue at all', () => {
    const state = readQueueState(makeGame({ joinQueues: undefined }), 'a');
    expect(state.entries).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.viewerPosition).toBeNull();
  });
});

/**
 * Losing the race the spot-opened push starts must not read as a win.
 *
 * `POST /games/:id/join` answers **200** with `errors.invites.gameFull` when
 * the seat went to somebody else, and the shell used to route anything outside
 * two hard-coded keys to `toast.success` — a green checkmark reading "Game is
 * full".
 */
describe('joinOutcomeTone', () => {
  it('celebrates the outcomes that actually did something', () => {
    expect(joinOutcomeTone('games.joinedSuccessfully')).toBe('success');
    expect(joinOutcomeTone('games.joinRequestAccepted')).toBe('success');
    expect(joinOutcomeTone('games.addedToJoinQueue')).toBe('success');
  });

  it('treats losing the last seat as a failure, not a success', () => {
    expect(joinOutcomeTone('errors.invites.gameFull')).toBe('error');
    expect(joinOutcomeTone('errors.games.cannotAddPlayer')).toBe('error');
    expect(joinOutcomeTone('games.alreadyInJoinQueue')).toBe('error');
    expect(joinOutcomeTone('games.addedToQueueLevelOutOfRange')).toBe('error');
    expect(joinOutcomeTone('spots.queue.waitForOrganizer')).toBe('error');
  });

  it('falls back to success for the legacy plain-text message', () => {
    expect(joinOutcomeTone('Successfully joined the game')).toBe('success');
    expect(joinOutcomeTone('')).toBe('success');
    expect(joinOutcomeTone(undefined)).toBe('success');
    expect(joinOutcomeTone(null)).toBe('success');
  });
});
