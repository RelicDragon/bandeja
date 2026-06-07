import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../chatLocalApplyThreadEvent', () => ({
  applyThreadEvent: vi.fn(async () => 2),
}));

import { applyThreadEvent } from '../chatLocalApplyThreadEvent';
import { pullAndApplyChatSyncEvents } from '../chatLocalApplyPull';

describe('chatLocalApplyPull public API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pullAndApplyChatSyncEvents routes through applyThreadEvent syncPull', async () => {
    const rev = await pullAndApplyChatSyncEvents('USER', 'u1');
    expect(applyThreadEvent).toHaveBeenCalledWith({
      kind: 'syncPull',
      contextType: 'USER',
      contextId: 'u1',
    });
    expect(rev).toBe(2);
  });
});
