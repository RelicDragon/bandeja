import { describe, expect, it } from 'vitest';
import {
  buildArchivedGameStub,
  isCancelledGameParticipant,
  isCancelledGame410Payload,
} from './cancelledGameChatStub';

describe('cancelledGameChatStub', () => {
  it('detects cancelled 410 payload', () => {
    expect(isCancelledGame410Payload({ cancelled: true })).toBe(true);
    expect(isCancelledGame410Payload({ cancelled: false })).toBe(false);
  });

  it('builds game stub with participant snapshot', () => {
    const stub = buildArchivedGameStub('g1', {
      cancelled: true,
      name: 'Test game',
      participants: [
        {
          userId: 'u1',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'u1', firstName: 'A', lastName: 'B' } as import('@/types').BasicUser,
        },
      ],
    });
    expect(stub.id).toBe('g1');
    expect(stub.status).toBe('ARCHIVED');
    expect(stub.participants).toHaveLength(1);
    expect(stub.participants[0]?.userId).toBe('u1');
  });

  it('isCancelledGameParticipant checks snapshot membership', () => {
    const participants = [
      {
        userId: 'u1',
        role: 'OWNER' as const,
        status: 'PLAYING' as const,
        user: { id: 'u1' } as import('@/types').BasicUser,
      },
    ];
    expect(isCancelledGameParticipant(participants, 'u1')).toBe(true);
    expect(isCancelledGameParticipant(participants, 'u2')).toBe(false);
  });
});
