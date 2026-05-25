import assert from 'node:assert/strict';
import { BracketSlotKind } from '@prisma/client';
import {
  buildBracketGameSortMetaMap,
  sortBracketRoundGames,
} from './bracketScheduleListSort.util';

function run() {
  const meta = buildBracketGameSortMetaMap([
    { gameId: 'main-r1', slotKind: BracketSlotKind.MAIN, roundIndex: 1 },
    { gameId: 'pi-1', slotKind: BracketSlotKind.PLAY_IN, roundIndex: 0 },
    { gameId: 'main-r0', slotKind: BracketSlotKind.MAIN, roundIndex: 0 },
    { gameId: 'pi-2', slotKind: BracketSlotKind.PLAY_IN, roundIndex: 0 },
  ]);

  assert.equal(meta.size, 4);
  assert.equal(meta.get('pi-1')?.kind, 'PLAY_IN');

  const games = [
    { id: 'main-r1', startTime: new Date('2026-01-03') },
    { id: 'pi-2', startTime: new Date('2026-01-02') },
    { id: 'main-r0', startTime: new Date('2026-01-04') },
    { id: 'pi-1', startTime: new Date('2026-01-01') },
  ];
  const sorted = sortBracketRoundGames(games, meta).map((g) => g.id);
  assert.deepEqual(sorted, ['pi-1', 'pi-2', 'main-r0', 'main-r1']);

  const noMeta = sortBracketRoundGames(
    [
      { id: 'b', startTime: new Date('2026-02-02') },
      { id: 'a', startTime: new Date('2026-02-01') },
    ],
    new Map()
  );
  assert.deepEqual(
    noMeta.map((g) => g.id),
    ['b', 'a']
  );

  console.log('bracketScheduleListSort.util.test.ts: ok');
}

run();
