import { describe, expect, it } from 'vitest';
import { virtualRowOffset } from '@/components/playerInvite/virtualRowOffset';

describe('PlayerInviteVirtualList scrollMargin', () => {
  it('subtracts scrollMargin so rows stay aligned under an in-sheet header', () => {
    expect(virtualRowOffset(120, 120)).toBe(0);
    expect(virtualRowOffset(208, 120)).toBe(88);
  });
});
