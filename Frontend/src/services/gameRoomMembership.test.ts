import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __gameRoomRefCountForTests,
  __resetGameRoomMembershipForTests,
  releaseGameRoom,
  retainGameRoom,
} from './gameRoomMembership';

vi.mock('@/services/socketService', () => ({
  socketService: {
    joinGameRoom: vi.fn(async () => undefined),
    leaveGameRoom: vi.fn(),
    onConnect: vi.fn(() => () => undefined),
  },
}));

import { socketService } from '@/services/socketService';

describe('gameRoomMembership', () => {
  beforeEach(() => {
    __resetGameRoomMembershipForTests();
    vi.mocked(socketService.joinGameRoom).mockReset();
    vi.mocked(socketService.leaveGameRoom).mockReset();
    vi.mocked(socketService.onConnect).mockReset();
    vi.mocked(socketService.onConnect).mockReturnValue(() => undefined);
    vi.mocked(socketService.joinGameRoom).mockResolvedValue(undefined);
  });

  it('joins once for multiple retains and leaves on final release', async () => {
    await retainGameRoom('g1');
    await retainGameRoom('g1');
    expect(socketService.joinGameRoom).toHaveBeenCalledTimes(1);
    expect(__gameRoomRefCountForTests('g1')).toBe(2);

    releaseGameRoom('g1');
    expect(socketService.leaveGameRoom).not.toHaveBeenCalled();
    expect(__gameRoomRefCountForTests('g1')).toBe(1);

    releaseGameRoom('g1');
    expect(socketService.leaveGameRoom).toHaveBeenCalledTimes(1);
    expect(socketService.leaveGameRoom).toHaveBeenCalledWith('g1');
    expect(__gameRoomRefCountForTests('g1')).toBe(0);
  });

  it('tracks rooms independently', async () => {
    await retainGameRoom('a');
    await retainGameRoom('b');
    expect(socketService.joinGameRoom).toHaveBeenCalledTimes(2);
    releaseGameRoom('a');
    expect(socketService.leaveGameRoom).toHaveBeenCalledWith('a');
    expect(__gameRoomRefCountForTests('b')).toBe(1);
  });

  it('rolls back refcount when first join fails so a later retain can retry', async () => {
    vi.mocked(socketService.joinGameRoom).mockRejectedValueOnce(new Error('offline'));
    await expect(retainGameRoom('g1')).rejects.toThrow('offline');
    expect(__gameRoomRefCountForTests('g1')).toBe(0);

    vi.mocked(socketService.joinGameRoom).mockResolvedValueOnce(undefined);
    await retainGameRoom('g1');
    expect(socketService.joinGameRoom).toHaveBeenCalledTimes(2);
    expect(__gameRoomRefCountForTests('g1')).toBe(1);
  });
});
