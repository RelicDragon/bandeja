import { describe, expect, it } from 'vitest';
import type { GameParticipant } from '@/types';
import {
  eventGoingParticipants,
  eventLookingParticipants,
  eventViewerIntent,
} from './eventParticipantLists';

function part(over: Partial<GameParticipant> & Pick<GameParticipant, 'userId' | 'status'>): GameParticipant {
  return {
    role: 'PARTICIPANT',
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id: over.userId, firstName: 'A', lastName: 'B' } as GameParticipant['user'],
    ...over,
  };
}

describe('eventParticipantLists', () => {
  it('splits going and looking without slot occupancy', () => {
    const parts = [
      part({ userId: '1', status: 'PLAYING' }),
      part({ userId: '2', status: 'NON_PLAYING', lookingForPartner: true }),
      part({ userId: '3', status: 'PLAYING', lookingForPartner: false }),
    ];
    expect(eventGoingParticipants(parts).map((p) => p.userId)).toEqual(['1', '3']);
    expect(eventLookingParticipants(parts).map((p) => p.userId)).toEqual(['2']);
  });

  it('XOR intent: looking wins over playing flag', () => {
    expect(eventViewerIntent([part({ userId: 'u', status: 'PLAYING' })], 'u')).toBe('going');
    expect(
      eventViewerIntent(
        [part({ userId: 'u', status: 'NON_PLAYING', lookingForPartner: true })],
        'u',
      ),
    ).toBe('looking');
    expect(
      eventViewerIntent(
        [part({ userId: 'u', status: 'NON_PLAYING', lookingForPartner: false, role: 'OWNER' })],
        'u',
      ),
    ).toBeNull();
  });
});
