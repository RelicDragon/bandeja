import {
  buildEqualTopKQualifiers,
  buildUnequalTopKQualifiers,
  mergeGlobalParticipantIds,
  validateCrossGroupPool,
  validateUnequalCrossGroupPool,
} from './crossGroupBracketSeeding';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, substr: string): void {
  try {
    fn();
    console.error('FAIL: expected throw', substr);
    process.exit(1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(substr)) {
      console.error('FAIL: throw message', msg, 'expected', substr);
      process.exit(1);
    }
  }
}

const groups = [
  { leagueGroupId: 'A', participantIds: ['A1', 'A2', 'A3', 'A4', 'A5'] },
  { leagueGroupId: 'B', participantIds: ['B1', 'B2'] },
  { leagueGroupId: 'C', participantIds: ['C1', 'C2', 'C3', 'C4'] },
  { leagueGroupId: 'D', participantIds: ['D1', 'D2', 'D3'] },
];

const qualifiers = buildEqualTopKQualifiers(groups, 2);
assert(JSON.stringify(qualifiers.A) === '["A1","A2"]', 'A top 2 (uneven sizes, K=2)');
assert(JSON.stringify(qualifiers.B) === '["B1","B2"]', 'B top 2');
assert(JSON.stringify(qualifiers.C) === '["C1","C2"]', 'C top 2');
assert(JSON.stringify(qualifiers.D) === '["D1","D2"]', 'D top 2');

const order = ['A', 'B', 'C', 'D'];
const winners = mergeGlobalParticipantIds(qualifiers, order, 'WINNERS_THEN_RUNNERS_UP');
assert(
  JSON.stringify(winners) === '["A1","B1","C1","D1","A2","B2","C2","D2"]',
  'WINNERS_THEN_RUNNERS_UP 4x2'
);

const previewSwapped = mergeGlobalParticipantIds(qualifiers, order, 'WINNERS_THEN_RUNNERS_UP', [
  'D2',
  'C2',
  'B2',
  'A2',
  'D1',
  'C1',
  'B1',
  'A1',
]);
assert(
  JSON.stringify(previewSwapped) === '["D2","C2","B2","A2","D1","C1","B1","A1"]',
  'WINNERS_THEN_RUNNERS_UP honors bracket preview reorder'
);

const block = mergeGlobalParticipantIds(qualifiers, order, 'GROUP_BLOCK');
assert(
  JSON.stringify(block) === '["A1","A2","B1","B2","C1","C2","D1","D2"]',
  'GROUP_BLOCK 4x2'
);

validateCrossGroupPool({
  k: 2,
  includedGroupIds: order,
  qualifiers,
  globalParticipantIds: winners,
});

assertThrows(
  () => buildEqualTopKQualifiers([{ leagueGroupId: 'B', participantIds: ['B1'] }], 2),
  'GROUP_TOO_SMALL'
);

assertThrows(
  () =>
    validateCrossGroupPool({
      k: 2,
      includedGroupIds: ['A', 'B'],
      qualifiers: { A: ['A1', 'A2'], B: ['B1', 'B2'] },
      globalParticipantIds: ['A1', 'A2', 'B1'],
    }),
  'GLOBAL_COUNT_MISMATCH'
);

assertThrows(
  () =>
    validateCrossGroupPool({
      k: 2,
      includedGroupIds: ['A'],
      qualifiers: { A: ['A1', 'A2'] },
      globalParticipantIds: ['A1', 'A2'],
    }),
  'CROSS_GROUP_REQUIRES_TWO_GROUPS'
);

assertThrows(
  () =>
    validateCrossGroupPool({
      k: 3,
      includedGroupIds: ['A', 'B', 'C', 'D', 'E', 'F'],
      qualifiers: {
        A: ['A1', 'A2', 'A3'],
        B: ['B1', 'B2', 'B3'],
        C: ['C1', 'C2', 'C3'],
        D: ['D1', 'D2', 'D3'],
        E: ['E1', 'E2', 'E3'],
        F: ['F1', 'F2', 'F3'],
      },
      globalParticipantIds: [
        'A1',
        'B1',
        'C1',
        'D1',
        'E1',
        'F1',
        'A2',
        'B2',
        'C2',
        'D2',
        'E2',
        'F2',
        'A3',
        'B3',
        'C3',
        'D3',
        'E3',
        'F3',
      ],
    }),
  'TOTAL_ENTRANTS_OUT_OF_RANGE'
);

const manual = mergeGlobalParticipantIds(qualifiers, order, 'MANUAL', [
  'D2',
  'A1',
  'C1',
  'B1',
  'D1',
  'A2',
  'C2',
  'B2',
]);
assert(manual.length === 8, 'manual order length');

// Uneven group sizes: K=2 still takes top 2 from each group with different roster depths
const uneven = [
  { leagueGroupId: 'A', participantIds: ['A1', 'A2', 'A3', 'A4', 'A5'] },
  { leagueGroupId: 'B', participantIds: ['B1', 'B2'] },
  { leagueGroupId: 'C', participantIds: ['C1', 'C2', 'C3'] },
];
const unevenQ = buildEqualTopKQualifiers(uneven, 2);
assert(JSON.stringify(unevenQ.A) === '["A1","A2"]', 'uneven A top 2');
assert(JSON.stringify(unevenQ.B) === '["B1","B2"]', 'uneven B top 2');
assert(JSON.stringify(unevenQ.C) === '["C1","C2"]', 'uneven C top 2');
const unevenOrder = ['A', 'B', 'C'];
const unevenGlobal = mergeGlobalParticipantIds(unevenQ, unevenOrder, 'WINNERS_THEN_RUNNERS_UP');
assert(
  JSON.stringify(unevenGlobal) === '["A1","B1","C1","A2","B2","C2"]',
  'uneven WINNERS_THEN_RUNNERS_UP'
);
validateCrossGroupPool({
  k: 2,
  includedGroupIds: unevenOrder,
  qualifiers: unevenQ,
  globalParticipantIds: unevenGlobal,
});

assertThrows(
  () =>
    validateCrossGroupPool({
      k: 3,
      includedGroupIds: ['A', 'B', 'C', 'D', 'E', 'F'],
      qualifiers: {
        A: ['A1', 'A2', 'A3'],
        B: ['B1', 'B2', 'B3'],
        C: ['C1', 'C2', 'C3'],
        D: ['D1', 'D2', 'D3'],
        E: ['E1', 'E2', 'E3'],
        F: ['F1', 'F2', 'F3'],
      },
      globalParticipantIds: [
        'A1',
        'B1',
        'C1',
        'D1',
        'E1',
        'F1',
        'A2',
        'B2',
        'C2',
        'D2',
        'E2',
        'F2',
        'A3',
        'B3',
        'C3',
        'D3',
        'E3',
        'F3',
      ],
    }),
  'TOTAL_ENTRANTS_OUT_OF_RANGE'
);

const unequalTeams = [
  { leagueGroupId: 'A', k: 3 },
  { leagueGroupId: 'B', k: 2 },
  { leagueGroupId: 'C', k: 1 },
];
const unequalGroups = [
  { leagueGroupId: 'A', participantIds: ['A1', 'A2', 'A3', 'A4'] },
  { leagueGroupId: 'B', participantIds: ['B1', 'B2', 'B3'] },
  { leagueGroupId: 'C', participantIds: ['C1', 'C2'] },
];
const unequalQ = buildUnequalTopKQualifiers(unequalTeams, unequalGroups);
assert(JSON.stringify(unequalQ.A) === '["A1","A2","A3"]', 'unequal K=3 from A');
assert(JSON.stringify(unequalQ.B) === '["B1","B2"]', 'unequal K=2 from B');
assert(JSON.stringify(unequalQ.C) === '["C1"]', 'unequal K=1 from C');
const unequalOrder = ['A', 'B', 'C'];
const unequalGlobal = mergeGlobalParticipantIds(unequalQ, unequalOrder, 'WINNERS_THEN_RUNNERS_UP');
assert(
  JSON.stringify(unequalGlobal) === '["A1","B1","C1","A2","B2","A3"]',
  'unequal WINNERS_THEN_RUNNERS_UP 3+2+1'
);
validateUnequalCrossGroupPool({
  includedGroupIds: unequalOrder,
  qualifiers: unequalQ,
  globalParticipantIds: unequalGlobal,
  teamsPerGroup: unequalTeams,
});

assertThrows(
  () =>
    validateUnequalCrossGroupPool({
      includedGroupIds: ['A', 'B'],
      qualifiers: { A: ['A1', 'A2'], B: ['B1'] },
      globalParticipantIds: ['A1', 'A2', 'B1', 'B2'],
    }),
  'GLOBAL_COUNT_MISMATCH'
);

console.log('ok: all cross-group bracket seeding tests passed');
