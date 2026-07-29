import assert from 'node:assert/strict';
import {
  canIntentJoinProposal,
  type IntentCriteria,
} from './playIntentCriteria';

function criteria(overrides: Partial<IntentCriteria> = {}): IntentCriteria {
  return {
    dateKeys: ['2026-07-29'],
    clubIds: [],
    minLevel: null,
    maxLevel: null,
    timeOfDay: 'ANYTIME',
    startTime: null,
    endTime: null,
    genderTeams: 'ANY',
    userLevel: 3,
    userGender: 'MALE',
    ...overrides,
  };
}

{
  const remainingRoster = [
    criteria({ userLevel: 3 }),
    criteria({ userLevel: 3.5 }),
  ];
  const removedButStillCompatible = criteria({ userLevel: 4 });

  assert.equal(
    canIntentJoinProposal(removedButStillCompatible, remainingRoster),
    true,
    'an eligible removed player must still be addable from a freshly loaded pool',
  );
}

{
  const remainingRoster = [
    criteria({ clubIds: ['club-a'] }),
    criteria({ clubIds: ['club-a'] }),
  ];
  const incompatibleCandidate = criteria({ clubIds: ['club-b'] });

  assert.equal(canIntentJoinProposal(incompatibleCandidate, remainingRoster), false);
}

console.log('proposalRosterEligibility.test.ts: ok');
