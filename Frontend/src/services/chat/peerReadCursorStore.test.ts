import { beforeEach, describe, expect, it } from 'vitest';
import type { PeerReadCursor } from './peerReadCursor';
import {
  getMaxPeerReadCursor,
  seedMaxPeerReadCursor,
  upsertPeerReadCursor,
} from './peerReadCursorStore';

function peer(overrides: Partial<PeerReadCursor> = {}): PeerReadCursor {
  return {
    userId: 'u1',
    chatContextType: 'USER',
    contextId: 'c1',
    chatType: 'PUBLIC',
    readMaxServerSyncSeq: 10,
    readMaxCreatedAt: '2026-01-01T00:00:00.000Z',
    readMaxMessageId: 'm10',
    updatedAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

describe('peerReadCursorStore', () => {
  beforeEach(() => {
    // Isolate by using unique contextIds per test via Date.now is flaky;
    // upsert into dedicated ids in each test.
  });

  it('never lowers a peer cursor on out-of-order upsert', () => {
    const contextId = `fwd-${Math.random()}`;
    upsertPeerReadCursor(peer({ contextId, readMaxServerSyncSeq: 20, readMaxMessageId: 'm20' }));
    upsertPeerReadCursor(
      peer({
        contextId,
        readMaxServerSyncSeq: 5,
        readMaxMessageId: 'm5',
        updatedAt: '2026-06-01T00:00:00.000Z',
      })
    );
    const max = getMaxPeerReadCursor('USER', contextId, 'PUBLIC');
    expect(max?.readMaxServerSyncSeq).toBe(20);
    expect(max?.readMaxMessageId).toBe('m20');
  });

  it('seeded max merges forward-only with peer upserts', () => {
    const contextId = `seed-${Math.random()}`;
    seedMaxPeerReadCursor({
      chatContextType: 'USER',
      contextId,
      chatType: 'PUBLIC',
      readMaxServerSyncSeq: 8,
      readMaxCreatedAt: '2026-01-01T00:00:00.000Z',
      readMaxMessageId: 'm8',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(getMaxPeerReadCursor('USER', contextId, 'PUBLIC')?.readMaxServerSyncSeq).toBe(8);

    upsertPeerReadCursor(peer({ contextId, userId: 'u2', readMaxServerSyncSeq: 12, readMaxMessageId: 'm12' }));
    expect(getMaxPeerReadCursor('USER', contextId, 'PUBLIC')?.readMaxServerSyncSeq).toBe(12);

    seedMaxPeerReadCursor({
      chatContextType: 'USER',
      contextId,
      chatType: 'PUBLIC',
      readMaxServerSyncSeq: 3,
      readMaxCreatedAt: '2026-01-01T00:00:00.000Z',
      readMaxMessageId: 'm3',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(getMaxPeerReadCursor('USER', contextId, 'PUBLIC')?.readMaxServerSyncSeq).toBe(12);
  });
});
