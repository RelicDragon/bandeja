import { describe, expect, it } from 'vitest';

/** Mirrors BroadcastTeamRoster / LiveTeamPanel serve-row targeting for singles vs doubles. */
function rosterServeRowIndex(
  playerCount: number,
  serverPlayerIndex: number,
  rowIndex: number,
): boolean {
  const target =
    playerCount <= 1 ? 0 : Math.min(Math.max(0, serverPlayerIndex), playerCount - 1);
  return rowIndex === target;
}

describe('broadcast/tv roster serve highlight', () => {
  it('1v1: only row 0 can be serving', () => {
    expect(rosterServeRowIndex(1, 0, 0)).toBe(true);
    expect(rosterServeRowIndex(1, 1, 0)).toBe(true);
    expect(rosterServeRowIndex(1, 0, 1)).toBe(false);
  });

  it('2v2: respects serverPlayerIndex within roster', () => {
    expect(rosterServeRowIndex(2, 0, 0)).toBe(true);
    expect(rosterServeRowIndex(2, 0, 1)).toBe(false);
    expect(rosterServeRowIndex(2, 1, 1)).toBe(true);
  });
});
