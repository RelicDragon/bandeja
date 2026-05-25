import { BracketSlotKind, ResultsStatus } from '@prisma/client';
import {
  collectDescendantSlotIds,
  hasBlockingDownstreamMainFinal,
  playInPhaseHasFinal,
  mainRoundHasFinal,
  slotsById,
} from './bracketSlotEdit.util';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const slots = [
  {
    id: 'bye',
    slotKind: BracketSlotKind.BYE,
    phaseIndex: 0,
    roundIndex: 0,
    leagueParticipantId: 'p1',
    gameId: null,
    winnerSlotId: 'qf0',
    feederSlotAId: null,
    feederSlotBId: null,
    game: null,
  },
  {
    id: 'pi',
    slotKind: BracketSlotKind.PLAY_IN,
    phaseIndex: 0,
    roundIndex: 0,
    leagueParticipantId: null,
    gameId: 'g-pi',
    winnerSlotId: 'qf0',
    feederSlotAId: null,
    feederSlotBId: null,
    game: { resultsStatus: ResultsStatus.NONE },
  },
  {
    id: 'qf0',
    slotKind: BracketSlotKind.MAIN,
    phaseIndex: 1,
    roundIndex: 0,
    leagueParticipantId: null,
    gameId: 'g-qf',
    winnerSlotId: 'final',
    feederSlotAId: 'bye',
    feederSlotBId: 'pi',
    game: { resultsStatus: ResultsStatus.FINAL },
  },
  {
    id: 'final',
    slotKind: BracketSlotKind.MAIN,
    phaseIndex: 1,
    roundIndex: 2,
    leagueParticipantId: null,
    gameId: null,
    winnerSlotId: null,
    feederSlotAId: 'qf0',
    feederSlotBId: null,
    game: null,
  },
];

const byId = slotsById(slots);

assert(collectDescendantSlotIds('bye', byId).has('qf0'), 'bye feeds qf0');
assert(collectDescendantSlotIds('pi', byId).has('qf0'), 'pi feeds qf0');
assert(hasBlockingDownstreamMainFinal('pi', byId), 'pi blocked when qf final');
assert(hasBlockingDownstreamMainFinal('bye', byId), 'bye blocked when descendant qf final');

const piFinal = [
  {
    ...slots[1],
    game: { resultsStatus: ResultsStatus.FINAL },
  },
];
assert(playInPhaseHasFinal(piFinal), 'play-in phase locked');
assert(mainRoundHasFinal(slots, 0), 'main r0 locked');

console.log('ok: bracketSlotEdit.util.test.ts');
