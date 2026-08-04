import assert from 'node:assert/strict';
import { BracketSlotKind, ResultsStatus } from '@prisma/client';
import {
  allDecisiveBracketGamesFinal,
  isDecisiveSlot,
} from './leagueSeasonFinalize.service';
import type { ChampionshipSlotLite } from './bracketChampionship.util';

function slot(
  partial: Partial<ChampionshipSlotLite> &
    Pick<ChampionshipSlotLite, 'slotKind'> & { leagueGroupId?: string | null }
): ChampionshipSlotLite & { leagueGroupId: string | null } {
  const { leagueGroupId, ...rest } = partial;
  return {
    winnerSlotId: null,
    feederSlotAId: null,
    gameId: null,
    game: null,
    roundIndex: 0,
    ...rest,
    leagueGroupId: leagueGroupId !== undefined ? leagueGroupId : 'g1',
  };
}

function group(
  ...slots: Array<ChampionshipSlotLite & { leagueGroupId: string | null }>
): Map<string | null, ChampionshipSlotLite[]> {
  const m = new Map<string | null, ChampionshipSlotLite[]>();
  for (const s of slots) {
    const key = s.leagueGroupId;
    const list = m.get(key) ?? [];
    list.push(s);
    m.set(key, list);
  }
  return m;
}

function run(): void {
  // --- isDecisiveSlot ---

  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.MAIN, winnerSlotId: null }, false),
    true,
    'terminal MAIN slot (no winnerSlotId) is decisive',
  );
  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.MAIN, winnerSlotId: 'down' }, false),
    false,
    'non-terminal MAIN slot is not decisive',
  );
  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.THIRD_PLACE, winnerSlotId: null }, false),
    false,
    'THIRD_PLACE is not decisive when third place is disabled',
  );
  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.THIRD_PLACE, winnerSlotId: null }, true),
    true,
    'THIRD_PLACE is decisive when third place is enabled',
  );
  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.GRAND_FINAL, winnerSlotId: null }, false),
    true,
    'terminal GRAND_FINAL slot is decisive',
  );
  assert.equal(
    isDecisiveSlot({ slotKind: BracketSlotKind.PLAY_IN, winnerSlotId: null }, false),
    false,
    'PLAY_IN is never decisive',
  );

  // --- allDecisiveBracketGamesFinal ---

  assert.equal(
    allDecisiveBracketGamesFinal(new Map(), null),
    false,
    'no slots → not decided',
  );

  // Single group, final done, no third place configured.
  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 0,
          winnerSlotId: 'down',
          gameId: 'qf1',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
        slot({
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          winnerSlotId: null,
          gameId: 'final',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ),
      null,
    ),
    true,
    'terminal final FINAL with no thrid place → decided',
  );

  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'final',
          game: { resultsStatus: ResultsStatus.IN_PROGRESS },
        }),
      ),
      null,
    ),
    false,
    'terminal final not FINAL → not decided',
  );

  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'final',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
        slot({
          slotKind: BracketSlotKind.THIRD_PLACE,
          gameId: 'third',
          game: { resultsStatus: ResultsStatus.IN_PROGRESS },
        }),
      ),
      null,
    ),
    false,
    'third-place configured but pending → not decided',
  );

  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'final',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
        slot({
          slotKind: BracketSlotKind.THIRD_PLACE,
          gameId: 'third',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ),
      null,
    ),
    true,
    'final + third both FINAL → decided',
  );

  // Multi-group: all groups must be decided.
  const multiGroupOnePending = new Map<string | null, ChampionshipSlotLite[]>([
    [
      'g1',
      [
        slot({
          leagueGroupId: 'g1',
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'finalA',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ],
    ],
    [
      'g2',
      [
        slot({
          leagueGroupId: 'g2',
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'finalB',
          game: { resultsStatus: ResultsStatus.IN_PROGRESS },
        }),
      ],
    ],
  ]);
  assert.equal(
    allDecisiveBracketGamesFinal(multiGroupOnePending, null),
    false,
    'multi-group with one final pending → not decided',
  );

  const multiGroupAllDone = new Map<string | null, ChampionshipSlotLite[]>([
    [
      'g1',
      [
        slot({
          leagueGroupId: 'g1',
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'finalA',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ],
    ],
    [
      'g2',
      [
        slot({
          leagueGroupId: 'g2',
          slotKind: BracketSlotKind.MAIN,
          roundIndex: 2,
          gameId: 'finalB',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ],
    ],
  ]);
  assert.equal(
    allDecisiveBracketGamesFinal(multiGroupAllDone, null),
    true,
    'multi-group with all finals FINAL → decided',
  );

  // DE first grand final alone does not satisfy pure readiness.
  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.GRAND_FINAL,
          roundIndex: 0,
          winnerSlotId: 'reset',
          feederSlotAId: 'wf',
          gameId: 'gf0',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
        slot({
          slotKind: BracketSlotKind.GRAND_FINAL,
          roundIndex: 1,
          winnerSlotId: null,
          gameId: null,
          game: null,
        }),
      ),
      null,
    ),
    false,
    'pure path cannot decide DE without winners-champ identity',
  );

  // DE after reset FINAL is pure-ready.
  assert.equal(
    allDecisiveBracketGamesFinal(
      group(
        slot({
          slotKind: BracketSlotKind.GRAND_FINAL,
          roundIndex: 0,
          winnerSlotId: 'reset',
          feederSlotAId: 'wf',
          gameId: 'gf0',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
        slot({
          slotKind: BracketSlotKind.GRAND_FINAL,
          roundIndex: 1,
          winnerSlotId: null,
          gameId: 'gf1',
          game: { resultsStatus: ResultsStatus.FINAL },
        }),
      ),
      null,
    ),
    true,
    'DE reset FINAL → pure ready',
  );
}

run();
console.log('leagueSeasonFinalize tests passed');
