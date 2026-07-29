import { describe, expect, it } from 'vitest';
import {
  linkedPlayIntentInviteeIds,
  selectPlayIntentCreateSource,
} from './selectPlayIntentCreateSource';

describe('selectPlayIntentCreateSource', () => {
  it('keeps only selected direct invite intent links', () => {
    const source = selectPlayIntentCreateSource(
      {
        type: 'DIRECT',
        hostIntentId: 'host-intent',
        invitees: [
          { userId: 'one', intentId: 'intent-one' },
          { userId: 'two', intentId: 'intent-two' },
        ],
      },
      ['two', 'manual'],
    );

    expect(source).toEqual({
      type: 'DIRECT',
      hostIntentId: 'host-intent',
      invitees: [{ userId: 'two', intentId: 'intent-two' }],
    });
    expect([...linkedPlayIntentInviteeIds(source)]).toEqual(['two']);
  });

  it('keeps only selected proposal members', () => {
    expect(
      selectPlayIntentCreateSource(
        {
          type: 'PROPOSAL',
          proposalId: 'proposal',
          inviteeIds: ['one', 'two'],
        },
        ['one'],
      ),
    ).toEqual({
      type: 'PROPOSAL',
      proposalId: 'proposal',
      inviteeIds: ['one'],
    });
  });
});
