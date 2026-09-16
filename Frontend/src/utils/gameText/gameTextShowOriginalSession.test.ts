import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGameTextShowOriginalSession,
  getGameTextShowOriginal,
  setGameTextShowOriginal,
  subscribeGameTextShowOriginal,
  toggleGameTextShowOriginal,
} from './gameTextShowOriginalSession';

afterEach(() => {
  clearGameTextShowOriginalSession();
});

describe('gameTextShowOriginalSession', () => {
  it('defaults to false per game', () => {
    expect(getGameTextShowOriginal('g1')).toBe(false);
  });

  it('remembers preference per gameId across calls', () => {
    setGameTextShowOriginal('g1', true);
    setGameTextShowOriginal('g2', false);
    expect(getGameTextShowOriginal('g1')).toBe(true);
    expect(getGameTextShowOriginal('g2')).toBe(false);
  });

  it('toggle flips and returns next value', () => {
    expect(toggleGameTextShowOriginal('g1')).toBe(true);
    expect(toggleGameTextShowOriginal('g1')).toBe(false);
  });

  it('notifies subscribers when preference changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGameTextShowOriginal(listener);
    setGameTextShowOriginal('g1', true);
    expect(listener).toHaveBeenCalledTimes(1);
    setGameTextShowOriginal('g1', true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setGameTextShowOriginal('g1', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
