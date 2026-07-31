import {
  championshipResolvedByFirstGrandFinal,
  grandFinalResetRequired,
} from './bracketDoubleElimination.util';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

assert(
  championshipResolvedByFirstGrandFinal({
    firstFinalWinnerId: 'winners-champion',
    winnersChampionId: 'winners-champion',
  }),
  'winners-bracket champion resolves the first grand final'
);
assert(
  !championshipResolvedByFirstGrandFinal({
    firstFinalWinnerId: 'losers-champion',
    winnersChampionId: 'winners-champion',
  }),
  'losers-bracket champion winning first grand final does not resolve championship'
);
assert(
  grandFinalResetRequired({
    firstFinalWinnerId: 'losers-champion',
    winnersChampionId: 'winners-champion',
    losersChampionId: 'losers-champion',
  }),
  'losers-bracket champion win requires reset'
);
assert(
  !grandFinalResetRequired({
    firstFinalWinnerId: 'winners-champion',
    winnersChampionId: 'winners-champion',
    losersChampionId: 'losers-champion',
  }),
  'winners-bracket champion win does not require reset'
);
assert(
  !grandFinalResetRequired({
    firstFinalWinnerId: null,
    winnersChampionId: 'winners-champion',
    losersChampionId: 'losers-champion',
  }),
  'incomplete grand final cannot require reset'
);

console.log('ok: bracketDoubleElimination.util.test.ts');
