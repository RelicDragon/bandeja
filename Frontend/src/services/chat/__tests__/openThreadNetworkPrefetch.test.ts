import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOpenThreadNetworkPrefetch,
  consumeOpenThreadNetworkPrefetch,
  markOpenThreadNetworkPrefetched,
} from '../openThreadNetworkPrefetch';

describe('openThreadNetworkPrefetch', () => {
  afterEach(() => {
    clearOpenThreadNetworkPrefetch();
    vi.useRealTimers();
  });

  it('consumes mark once within window', () => {
    markOpenThreadNetworkPrefetched('GAME', 'g1');
    expect(consumeOpenThreadNetworkPrefetch('GAME', 'g1')).toBe(true);
    expect(consumeOpenThreadNetworkPrefetch('GAME', 'g1')).toBe(false);
  });

  it('does not consume after window expires', () => {
    vi.useFakeTimers();
    markOpenThreadNetworkPrefetched('USER', 'u1');
    vi.advanceTimersByTime(8_001);
    expect(consumeOpenThreadNetworkPrefetch('USER', 'u1')).toBe(false);
  });
});
