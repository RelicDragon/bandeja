import assert from 'node:assert/strict';
import {
  CROSS_GROUP_SLOT_SETUP_KEY,
  resolveBracketSlotGameSetup,
} from './bracketSlotGameSetup';

const config = {
  gameSetup: {
    scoringPreset: 'CLASSIC_PRO_SET',
    fixedNumberOfSets: 1,
    matchTimerEnabled: false,
  },
  slotGameSetups: {
    groupA: {
      'MAIN-R2-M0': {
        scoringPreset: 'CLASSIC_BEST_OF_3',
        fixedNumberOfSets: 3,
      },
    },
    [CROSS_GROUP_SLOT_SETUP_KEY]: {
      'MAIN-R1-M0': {
        scoringPreset: 'CLASSIC_BEST_OF_3',
        fixedNumberOfSets: 3,
      },
    },
  },
};

assert.deepEqual(resolveBracketSlotGameSetup(config, 'groupA', 'MAIN-R2-M0'), {
  scoringPreset: 'CLASSIC_BEST_OF_3',
  fixedNumberOfSets: 3,
  matchTimerEnabled: false,
});

assert.deepEqual(resolveBracketSlotGameSetup(config, 'groupA', 'MAIN-R1-M0'), {
  scoringPreset: 'CLASSIC_PRO_SET',
  fixedNumberOfSets: 1,
  matchTimerEnabled: false,
});

assert.deepEqual(resolveBracketSlotGameSetup(config, null, 'MAIN-R1-M0'), {
  scoringPreset: 'CLASSIC_BEST_OF_3',
  fixedNumberOfSets: 3,
  matchTimerEnabled: false,
});

assert.equal(resolveBracketSlotGameSetup(undefined, 'groupA', 'MAIN-R2-M0'), undefined);

console.log('bracketSlotGameSetup tests passed');
