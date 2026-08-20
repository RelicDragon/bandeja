import { describe, expect, it } from 'vitest';
import { addToGameToastKind } from './addToGameResult';

describe('addToGameToastKind', () => {
  it('prefers seated when both are playing as a pair', () => {
    expect(addToGameToastKind({ invitedUserIds: ['p'], pairSeated: true })).toBe('seated');
  });

  it('uses invited when a partner still needs to accept', () => {
    expect(addToGameToastKind({ invitedUserIds: ['p'], pairSeated: false })).toBe('invited');
  });

  it('uses added when both were already on the game', () => {
    expect(addToGameToastKind({ invitedUserIds: [], pairSeated: false })).toBe('added');
  });
});
