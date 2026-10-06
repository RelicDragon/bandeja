import { describe, expect, it } from 'vitest';
import { decodeChatMessageList } from '@/services/chat/chatMessageWire';

describe('decodeChatMessageList', () => {
  it('expands compact refs and defaults missing readReceipts', () => {
    const sender = { id: 'u1', firstName: 'Ana' };
    const decoded = decodeChatMessageList({
      compact: 1,
      refs: { 'sender:u1:0': sender },
      value: [
        { id: 'm1', sender: { $ref: 'sender:u1:0' }, reactions: [] },
        { id: 'm2', sender: { $ref: 'sender:u1:0' }, reactions: [] },
      ],
    });
    expect(decoded.map((m) => m.sender)).toEqual([sender, sender]);
    expect(decoded.every((m) => Array.isArray(m.readReceipts) && m.readReceipts.length === 0)).toBe(true);
  });

  it('passes full-shape arrays through and keeps their receipts', () => {
    const receipts = [{ id: 'r1', messageId: 'm1', userId: 'u2', readAt: '2026-01-01T00:00:00Z' }];
    const decoded = decodeChatMessageList([{ id: 'm1', readReceipts: receipts }]);
    expect(decoded[0]!.readReceipts).toBe(receipts);
    expect(decodeChatMessageList(undefined)).toEqual([]);
  });
});
