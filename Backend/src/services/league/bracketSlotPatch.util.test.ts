import {
  hasDuplicateBracketSlotSideUpdates,
  stalePlayingParticipantIds,
} from './bracketSlotPatch.util';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

assert(
  !hasDuplicateBracketSlotSideUpdates([
    { slotId: 'match-1', side: 'A' },
    { slotId: 'match-1', side: 'B' },
  ]),
  'same-match A/B swap is accepted'
);
assert(
  hasDuplicateBracketSlotSideUpdates([
    { slotId: 'match-1', side: 'A' },
    { slotId: 'match-1', side: 'A' },
  ]),
  'duplicate side update is rejected'
);

const staleIds = stalePlayingParticipantIds(
  [
    { id: 'keep-a', userId: 'a', role: 'PARTICIPANT', status: 'PLAYING' },
    { id: 'keep-b', userId: 'b', role: 'PARTICIPANT', status: 'PLAYING' },
    { id: 'remove', userId: 'old', role: 'PARTICIPANT', status: 'PLAYING' },
    { id: 'owner', userId: 'owner', role: 'OWNER', status: 'PLAYING' },
    { id: 'bench', userId: 'bench', role: 'PARTICIPANT', status: 'NON_PLAYING' },
  ],
  new Set(['a', 'b'])
);
assert(
  JSON.stringify(staleIds) === JSON.stringify(['remove']),
  'only stale playing participant rows are removed'
);

console.log('ok: bracketSlotPatch.util.test.ts');
