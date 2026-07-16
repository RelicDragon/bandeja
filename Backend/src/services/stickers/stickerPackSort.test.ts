import assert from 'assert';
import { sortStickerPacksForSport } from './stickerPackSort';

type Pack = { id: string; sport: 'PADEL' | 'TENNIS' | null; sortOrder: number };

function pack(id: string, sport: Pack['sport'], sortOrder: number): Pack {
  return { id, sport, sortOrder };
}

function testNoSportKeepsCallerOrder() {
  const packs = [
    pack('tennis', 'TENNIS', 0),
    pack('reactions', null, 1),
    pack('padel', 'PADEL', 2),
  ];
  assert.deepEqual(
    sortStickerPacksForSport(packs, null).map((p) => p.id),
    ['tennis', 'reactions', 'padel']
  );
  assert.deepEqual(
    sortStickerPacksForSport(packs, undefined).map((p) => p.id),
    ['tennis', 'reactions', 'padel']
  );
  console.log('ok no-sport keeps order');
}

function testPadelPrioritizesMatchThenGeneral() {
  const packs = [
    pack('reactions', null, 0),
    pack('tennis', 'TENNIS', 1),
    pack('padel-b', 'PADEL', 5),
    pack('padel-a', 'PADEL', 2),
  ];
  assert.deepEqual(
    sortStickerPacksForSport(packs, 'PADEL').map((p) => p.id),
    ['padel-a', 'padel-b', 'reactions', 'tennis']
  );
  console.log('ok padel sport priority');
}

function testStableWithinSameRank() {
  const packs = [
    pack('g2', null, 2),
    pack('g1', null, 1),
    pack('p1', 'PADEL', 0),
  ];
  assert.deepEqual(
    sortStickerPacksForSport(packs, 'PADEL').map((p) => p.id),
    ['p1', 'g1', 'g2']
  );
  console.log('ok sortOrder within rank');
}

function testPersonalPackFirst() {
  const packs = [
    { id: 'reactions', sport: null as 'PADEL' | 'TENNIS' | null, sortOrder: 0, isOfficial: true },
    {
      id: 'mine',
      sport: null as 'PADEL' | 'TENNIS' | null,
      sortOrder: -100,
      isOfficial: false,
      ownerUserId: 'u1',
    },
    { id: 'padel', sport: 'PADEL' as const, sortOrder: 1, isOfficial: true },
  ];
  assert.deepEqual(
    sortStickerPacksForSport(packs, 'PADEL').map((p) => p.id),
    ['mine', 'padel', 'reactions']
  );
  assert.deepEqual(
    sortStickerPacksForSport(packs, null).map((p) => p.id),
    ['mine', 'reactions', 'padel']
  );
  console.log('ok personal pack first');
}

testNoSportKeepsCallerOrder();
testPadelPrioritizesMatchThenGeneral();
testStableWithinSameRank();
testPersonalPackFirst();
