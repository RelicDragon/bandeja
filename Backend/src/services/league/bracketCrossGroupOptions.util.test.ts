import { resolveCrossGroupBracketPlanOptions } from './bracketCrossGroupOptions.util';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

const fallback = resolveCrossGroupBracketPlanOptions(
  {},
  {
    includeThirdPlace: true,
    includeConsolationBracket: true,
    customByeSeedRanks: [3],
    customPlayInPairings: [{ seedA: 1, seedB: 8 }],
  }
);
assert(fallback.includeThirdPlace === true, 'third-place top-level fallback');
assert(fallback.includeConsolationBracket === true, 'consolation top-level fallback');
assert(
  JSON.stringify(fallback.customByeSeedRanks) === JSON.stringify([3]),
  'custom bye top-level fallback'
);
assert(
  JSON.stringify(fallback.customPlayInPairings) ===
    JSON.stringify([{ seedA: 1, seedB: 8 }]),
  'custom play-in top-level fallback'
);

const override = resolveCrossGroupBracketPlanOptions(
  {
    includeThirdPlace: false,
    includeDoubleElimination: true,
    customByeSeedRanks: [2],
  },
  {
    includeThirdPlace: true,
    includeDoubleElimination: false,
    customByeSeedRanks: [1],
  }
);
assert(override.includeThirdPlace === false, 'cross-group false overrides top-level true');
assert(override.includeDoubleElimination === true, 'cross-group true overrides top-level false');
assert(
  JSON.stringify(override.customByeSeedRanks) === JSON.stringify([2]),
  'cross-group custom byes override top-level'
);

console.log('ok: bracketCrossGroupOptions.util.test.ts');
