import assert from 'node:assert/strict';
import { BracketSlotKind, ResultsStatus } from '@prisma/client';
import {
  isBracketTreePodiumReady,
  isChampionshipTreeDecided,
  selectChampionshipGame,
  type ChampionshipSlotLite,
} from './bracketChampionship.util';

function slot(
  partial: Partial<ChampionshipSlotLite> &
    Pick<ChampionshipSlotLite, 'slotKind' | 'roundIndex'>
): ChampionshipSlotLite {
  return {
    gameId: null,
    winnerSlotId: null,
    feederSlotAId: null,
    game: null,
    ...partial,
  };
}

// --- Single-elim MAIN final ---

{
  const slots = [
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 0,
      winnerSlotId: 'fin',
      gameId: 'sf',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 1,
      gameId: 'final',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
  ];
  const sel = selectChampionshipGame(slots);
  assert.equal(sel.kind, 'resolved_game');
  if (sel.kind === 'resolved_game') {
    assert.equal(sel.gameId, 'final');
    assert.equal(sel.source, 'main_final');
  }
  assert.equal(isChampionshipTreeDecided(slots), true);
  assert.equal(isBracketTreePodiumReady(slots, false), true);
}

{
  // Incomplete final → not decided (no RR fallback path).
  const slots = [
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 1,
      gameId: 'final',
      game: { resultsStatus: ResultsStatus.IN_PROGRESS },
    }),
  ];
  assert.equal(selectChampionshipGame(slots).kind, 'unresolved');
  assert.equal(isChampionshipTreeDecided(slots), false);
}

// --- Double-elim: reset played ---

{
  const slots = [
    slot({
      slotKind: BracketSlotKind.GRAND_FINAL,
      roundIndex: 0,
      gameId: 'gf0',
      winnerSlotId: 'reset',
      feederSlotAId: 'winners-final',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
    slot({
      slotKind: BracketSlotKind.GRAND_FINAL,
      roundIndex: 1,
      gameId: 'gf-reset',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
  ];
  const sel = selectChampionshipGame(slots);
  assert.equal(sel.kind, 'resolved_game');
  if (sel.kind === 'resolved_game') {
    assert.equal(sel.gameId, 'gf-reset');
    assert.equal(sel.source, 'grand_final_reset');
  }
  assert.equal(isChampionshipTreeDecided(slots), true);
}

// --- Double-elim: winners champion holds first GF (no reset game) ---

{
  const slots = [
    slot({
      slotKind: BracketSlotKind.GRAND_FINAL,
      roundIndex: 0,
      gameId: 'gf0',
      winnerSlotId: 'reset',
      feederSlotAId: 'winners-final',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
    // Unused conditional reset — must NOT block podium readiness when first GF resolves.
    slot({
      slotKind: BracketSlotKind.GRAND_FINAL,
      roundIndex: 1,
      gameId: null,
      game: null,
    }),
  ];
  const sel = selectChampionshipGame(slots);
  assert.equal(sel.kind, 'first_grand_final_candidate');
  assert.equal(isChampionshipTreeDecided(slots), false, 'needs winners-champ confirmation');
  assert.equal(
    isChampionshipTreeDecided(slots, { firstGrandFinalResolvedByWinnersChampion: true }),
    true,
    'winners hold → championship decided without reset'
  );
  assert.equal(
    isChampionshipTreeDecided(slots, { firstGrandFinalResolvedByWinnersChampion: false }),
    false,
    'losers won first GF → still needs reset'
  );
  assert.equal(
    isBracketTreePodiumReady(slots, false, {
      firstGrandFinalResolvedByWinnersChampion: true,
    }),
    true
  );
}

// --- Third place gating ---

{
  const slots = [
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 1,
      gameId: 'final',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
    slot({
      slotKind: BracketSlotKind.THIRD_PLACE,
      roundIndex: 0,
      gameId: 'third',
      game: { resultsStatus: ResultsStatus.IN_PROGRESS },
    }),
  ];
  assert.equal(isBracketTreePodiumReady(slots, true), false);
  assert.equal(isBracketTreePodiumReady(slots, false), true);
}

// --- Per-group / season-wide tree keys are independent: two trees each need own final ---
// (selection is per-tree; this only checks each tree picks its own final game)

{
  const groupA = [
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 1,
      gameId: 'final-a',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
  ];
  const groupB = [
    slot({
      slotKind: BracketSlotKind.MAIN,
      roundIndex: 1,
      gameId: 'final-b',
      game: { resultsStatus: ResultsStatus.FINAL },
    }),
  ];
  const a = selectChampionshipGame(groupA);
  const b = selectChampionshipGame(groupB);
  assert.equal(a.kind === 'resolved_game' && a.gameId, 'final-a');
  assert.equal(b.kind === 'resolved_game' && b.gameId, 'final-b');
}

console.log('bracketChampionship.util.test.ts: ok');
