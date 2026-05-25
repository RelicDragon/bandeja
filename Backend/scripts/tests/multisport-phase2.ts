/**
 * MULTISPORT Phase 2 — Find + Top (`MULTISPORT_FIND`) · G4
 * P2-QA-1: Find defaults primary; sport=all mixed; My not sport-filtered
 * P2-QA-2: Invites/chats paths have no sport filter
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { GameCreateService } from '../../src/services/game/create.service';
import { GameReadService } from '../../src/services/game/read.service';
import {
  resolveLeaderboardSportMode,
  resolvePublicGamesSportFilter,
} from '../../src/services/user/userSportProfile.service';

const backendRoot = join(__dirname, '..', '..');
const srcRoot = join(backendRoot, 'src');
const feRoot = join(backendRoot, '..', 'Frontend', 'src');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function readFe(rel: string): string {
  return readFileSync(join(feRoot, rel), 'utf8');
}

function testResolvePublicGamesSportFilter(): void {
  const defaultFilter = resolvePublicGamesSportFilter(undefined, Sport.PADEL);
  assert(defaultFilter.mode === 'single' && defaultFilter.sport === Sport.PADEL, 'omit sport → primary');
  assert(resolvePublicGamesSportFilter('all', Sport.PADEL).mode === 'all', 'sport=all → no filter');
  const tennisFilter = resolvePublicGamesSportFilter('TENNIS', Sport.PADEL);
  assert(tennisFilter.mode === 'single' && tennisFilter.sport === Sport.TENNIS, 'explicit sport param');
  console.log('ok: resolvePublicGamesSportFilter (P2-QA-1 contract)');
}

function testResolveLeaderboardSportMode(): void {
  const defaultMode = resolveLeaderboardSportMode(undefined, Sport.PADEL);
  assert(defaultMode.mode === 'sport' && defaultMode.sport === Sport.PADEL, 'leaderboard omit → primary sport profile');
  assert(resolveLeaderboardSportMode('all', Sport.PADEL).mode === 'all', 'leaderboard all → primary sport per user');
  const tennisMode = resolveLeaderboardSportMode('TENNIS', Sport.PADEL);
  assert(tennisMode.mode === 'sport' && tennisMode.sport === Sport.TENNIS, 'leaderboard explicit sport');
  console.log('ok: resolveLeaderboardSportMode (P2-TOP contract)');
}

function testSourceFindApi(): void {
  const readSrc = readSrcFile('services/game/read.service.ts');
  const controllerSrc = readSrcFile('controllers/game.controller.ts');

  assert(readSrc.includes('resolvePublicGamesSportFilter'), 'read.service imports resolvePublicGamesSportFilter');
  assert(readSrc.includes("if (sportFilter.mode === 'single')"), 'getAvailableGames applies sport when single');
  assert(readSrc.includes('where.sport = sportFilter.sport'), 'getAvailableGames sets where.sport');

  const availableBlock = sliceBetween(readSrc, 'static async getAvailableGames', 'static async getMyGames');
  assert(availableBlock.includes('resolvePublicGamesSportFilter'), 'sport filter only in getAvailableGames');

  const getGamesBlock = sliceBetween(readSrc, 'static async getGames(', 'static async getMyGames');
  assert(!getGamesBlock.includes('resolvePublicGamesSportFilter'), 'getGames must not use Find sport filter');

  assert(controllerSrc.includes('req.query.sport'), 'GET /games/available forwards sport query');
  console.log('ok: Find API source (P2-FIND-1)');
}

function testSourceMyNoSportFilter(): void {
  const readSrc = readSrcFile('services/game/read.service.ts');
  const myBlock = sliceBetween(readSrc, 'static async getMyGames', 'static async getMyGamesWithUnread');
  assert(!/where\.sport/.test(myBlock), 'getMyGames must not filter by sport');
  assert(!myBlock.includes('resolvePublicGamesSportFilter'), 'getMyGames must not use Find sport resolver');

  const pastBlock = sliceBetween(readSrc, 'static async getPastGames', 'static async getAvailableGames');
  assert(!/where\.sport/.test(pastBlock), 'getPastGames must not filter by sport');

  console.log('ok: My / past games audit — no sport filter (P2-QA-1)');
}

function testSourceInvitesChatsNoSportFilter(): void {
  const inviteSrc = readSrcFile('services/invite.service.ts');
  const inviteWhere = sliceBetween(inviteSrc, 'getMyPendingInvites', 'static async deleteInvitesForUserInGame');
  assert(!/where:\s*\{[^}]*sport/.test(inviteWhere), 'invites query must not filter games by sport');

  const unreadSrc = readSrcFile('services/chat/unreadObjects.service.ts');
  const unreadGamesFn = sliceBetween(unreadSrc, 'async function getGamesWithUnread', 'const gameIdsWithUnread');
  assert(!/sport/.test(unreadGamesFn.replace(/chatTypeFilter/g, '')), 'chat unread games list must not filter by sport');

  const groupSrc = readSrcFile('services/chat/groupChannel.service.ts');
  assert(!groupSrc.includes('where.sport'), 'group channels must not filter by sport');

  const searchSrc = readSrcFile('services/chat/messageSearch.service.ts');
  assert(!searchSrc.includes('Game.sport'), 'message search must not filter by game sport');

  console.log('ok: invites/chats audit — no sport filter (P2-QA-2)');
}

function testGateG4Asymmetry(): void {
  const readSrc = readSrcFile('services/game/read.service.ts');
  const hasFindFilter = readSrc.includes('resolvePublicGamesSportFilter') && readSrc.includes('where.sport = sportFilter.sport');
  const myBlock = sliceBetween(readSrc, 'static async getMyGames', 'static async getMyGamesWithUnread');
  const myFiltered = /where\.sport/.test(myBlock);
  assert(hasFindFilter && !myFiltered, 'G4: Find filters by sport; My does not');
  console.log('ok: gate G4 Find/My asymmetry');
}

function testFeFindContract(): void {
  const findFilter = readFe('utils/findSportFilter.ts');
  assert(findFilter.includes('findSportFilterToApiParam'), 'findSportFilterToApiParam');
  assert(findFilter.includes("return 'all'"), 'API param all');
  assert(findFilter.includes('shouldShowGameCardSportGlyph'), 'GameCard glyph helper');

  const storage = readFe('utils/gameFiltersStorage.ts');
  assert(storage.includes('filterSport'), 'gameFiltersStorage.filterSport');

  const panel = readFe('components/home/FiltersPanel.tsx');
  assert(panel.includes('onFilterSportChange'), 'FiltersPanel sport control');
  assert(panel.includes('filterSport'), 'FiltersPanel filterSport prop');

  const gamesApi = readFe('api/games.ts');
  assert(gamesApi.includes('sport?:'), 'games API accepts sport query param');

  const rankingApi = readFe('api/ranking.ts');
  assert(rankingApi.includes('sport?:'), 'ranking API accepts sport query param');

  console.log('ok: FE Find/Top contract (source audit)');
}

function readSrcFile(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

function sliceBetween(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  if (i === -1) return '';
  return j === -1 ? src.slice(i) : src.slice(i, j);
}

async function testDbFindMyAsymmetry(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true, currentCityId: { not: null } },
    select: { id: true, currentCityId: true, primarySport: true },
  });
  if (!user?.currentCityId) {
    console.log('skip: db Find/My asymmetry (no active user with city)');
    return;
  }

  const primary = user.primarySport ?? Sport.PADEL;
  const otherSport = primary === Sport.PADEL ? Sport.TENNIS : Sport.PADEL;
  const start = new Date(Date.now() + 3 * 86400000);
  const end = new Date(start.getTime() + 7200000);
  const base = {
    gameType: 'CLASSIC' as const,
    cityId: user.currentCityId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    maxParticipants: 4,
    isPublic: true,
    participants: [user.id],
  };

  const primaryGame = await GameCreateService.createGame({ ...base, sport: primary }, user.id, false);
  const otherGame = await GameCreateService.createGame({ ...base, sport: otherSport }, user.id, false);
  assert(primaryGame != null && otherGame != null, 'created test games');

  const ids = new Set([primaryGame!.id, otherGame!.id]);

  const findDefault = await GameReadService.getAvailableGames(
    user.id,
    user.currentCityId,
    undefined,
    undefined,
    true,
    false,
    undefined,
    primary,
  );
  const findDefaultHits = findDefault.filter((g) => ids.has(g.id));
  assert(findDefaultHits.some((g) => g.sport === primary), 'Find default includes primary-sport game');
  assert(!findDefaultHits.some((g) => g.sport === otherSport), 'Find default excludes other sport');

  const findAll = await GameReadService.getAvailableGames(
    user.id,
    user.currentCityId,
    undefined,
    undefined,
    true,
    false,
    'all',
    primary,
  );
  const findAllHits = findAll.filter((g) => ids.has(g.id));
  assert(findAllHits.length === 2, 'Find sport=all returns both test games');

  const myGames = await GameReadService.getMyGames(user.id, user.currentCityId);
  const myHits = myGames.filter((g) => ids.has(g.id));
  assert(myHits.length === 2, 'My feed includes both sports');

  await prisma.gameParticipant.deleteMany({ where: { gameId: { in: [...ids] } } });
  await prisma.game.deleteMany({ where: { id: { in: [...ids] } } });
  console.log('ok: db Find default / all / My mixed (P2-QA-1 integration)');
}

async function main(): Promise<void> {
  testResolvePublicGamesSportFilter();
  testResolveLeaderboardSportMode();
  testSourceFindApi();
  testSourceMyNoSportFilter();
  testSourceInvitesChatsNoSportFilter();
  testGateG4Asymmetry();
  testFeFindContract();
  await testDbFindMyAsymmetry();
  await prisma.$disconnect();
  console.log('multisport-phase2: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
