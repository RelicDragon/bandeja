import { describe, expect, it } from 'vitest';
import { readReceiptsFingerprint } from '../readReceiptsFingerprint';

describe('readReceiptsFingerprint', () => {
  it('is stable regardless of receipt order', () => {
    const a = readReceiptsFingerprint([
      { id: '1', messageId: 'm', userId: 'b', readAt: '2026-01-02' },
      { id: '2', messageId: 'm', userId: 'a', readAt: '2026-01-01' },
    ]);
    const b = readReceiptsFingerprint([
      { id: '2', messageId: 'm', userId: 'a', readAt: '2026-01-01' },
      { id: '1', messageId: 'm', userId: 'b', readAt: '2026-01-02' },
    ]);
    expect(a).toBe(b);
  });

  it('differs when readAt changes for same user', () => {
    const base = { id: '1', messageId: 'm', userId: 'u1' };
    const early = readReceiptsFingerprint([{ ...base, readAt: '2026-01-01' }]);
    const late = readReceiptsFingerprint([{ ...base, readAt: '2026-01-02' }]);
    expect(early).not.toBe(late);
  });
});
