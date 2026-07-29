import { describe, expect, it } from 'vitest';
import type { MatchProposalSummary } from '@/api/playIntents';
import { resolvePlayIntentProposal } from './playIntentProposal';

function proposal(id: string, userIds: string[]): MatchProposalSummary {
  return {
    id,
    dateKeys: ['2026-07-30'],
    startTime: null,
    endTime: null,
    clubIds: [],
    suggestedStartTime: null,
    expiresAt: '2026-07-30T20:00:00.000Z',
    members: userIds.map((userId) => ({
      userId,
      isHost: false,
      response: 'PENDING',
      firstName: userId,
      lastName: null,
      avatar: null,
      level: 3,
    })),
  };
}

describe('resolvePlayIntentProposal', () => {
  it('prefers the refreshed pool proposal over a stale deep-link snapshot', () => {
    const deepLinked = proposal('proposal-1', ['one', 'two', 'three']);
    const live = proposal('proposal-1', ['one', 'two', 'three', 'four']);

    expect(resolvePlayIntentProposal(live, deepLinked)?.members).toHaveLength(4);
  });

  it('drops deep-linked proposals once the live pool confirms none remain', () => {
    const deepLinked = proposal('proposal-1', ['one', 'two', 'three']);
    expect(resolvePlayIntentProposal(null, deepLinked)).toBeNull();
  });

  it('keeps the deep-link only while the live pool is still loading', () => {
    const deepLinked = proposal('proposal-1', ['one', 'two', 'three']);
    expect(resolvePlayIntentProposal(undefined, deepLinked)?.id).toBe('proposal-1');
  });
});
