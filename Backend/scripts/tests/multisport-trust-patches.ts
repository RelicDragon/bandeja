/**
 * Sport-scoped level display/calculation trust patches (outcome explanation, league groups, telegram results, merge).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { resolveUserSportSnapshot } from '../../src/services/user/userSportProfile.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, '../../src', rel), 'utf8');
}

function testSourcePatches(): void {
  const explanation = readSrc('services/results/outcomeExplanation.service.ts');
  assert(
    explanation.includes('resolveUserSportSnapshot'),
    'outcomeExplanation uses resolveUserSportSnapshot',
  );
  assert(
    !explanation.includes('p.user.level') && !explanation.includes('user.level'),
    'outcomeExplanation avoids raw user.level',
  );

  const league = readSrc('services/league/create.service.ts');
  assert(
    league.includes('resolveUserSportSnapshot') && league.includes('seasonSport'),
    'league createGroups uses sport-scoped sort level',
  );

  const resultsSummaryPrompt = readSrc('services/gameResultsArtifact/resultsSummaryPrompt.util.ts');
  assert(
    resultsSummaryPrompt.includes('resolveUserSportSnapshot'),
    'results summary prompt uses sport snapshot for participant level',
  );
  assert(
    resultsSummaryPrompt.includes('getCityLeaderboardRanks(cityId, gameSport)'),
    'results summary prompt uses sport-scoped city ranks',
  );
  assert(
    !resultsSummaryPrompt.includes('They played Padel game'),
    'results summary prompt uses game sport label',
  );

  const notifBase = readSrc('services/shared/notification-base.ts');
  assert(
    notifBase.includes('resolveUserSportSnapshot'),
    'notification-base uses sport snapshot for levels',
  );

  const gameResultsNotif = readSrc('services/telegram/notifications/game-results.notification.ts');
  assert(
    gameResultsNotif.includes('appendTelegramGameScheduleExtras(placeLine, game, game.sport'),
    'game-results telegram uses game sport for schedule extras',
  );

  const ranking = readSrc('services/ranking.service.ts');
  assert(
    ranking.includes('resolveUserSportSnapshot') && ranking.includes('sport: Sport'),
    'ranking service supports sport-scoped city ranks and 30-day counts',
  );
  assert(
    ranking.includes("'gamesWon'") && !ranking.includes('b.totalPoints'),
    'telegram city ranks tie-break on sport gamesWon not User.totalPoints',
  );

  const html = readSrc('services/telegram/results-html.service.ts');
  assert(
    html.includes('outcomeUserForSport') && html.includes('!withProfiles.sportProfiles'),
    'results-html skips re-projection for already sport-projected users',
  );

  const merge = readSrc('services/user/userMerge.service.ts');
  assert(merge.includes('mergeUserSportProfiles'), 'userMerge merges UserSportProfile rows');
  assert(merge.includes('syncUserLegacyPadelFromProfile'), 'userMerge syncs padel profile to User legacy columns');

  const rankingController = readSrc('controllers/ranking.controller.ts');
  assert(
    rankingController.includes('applyPrimarySportRankingSnapshot') &&
      rankingController.includes('primary sport profile (fallback PADEL)'),
    'leaderboard sport=all ranks by primary sport snapshot',
  );
  assert(
    rankingController.includes('applySocialSportSnapshot'),
    'social leaderboard uses per-sport reliability/gamesPlayed',
  );

  const reliabilityDecay = readSrc('services/reliabilityDecay.service.ts');
  assert(
    reliabilityDecay.includes('UserSportProfile') && reliabilityDecay.includes('Sport.PADEL'),
    'reliability decay uses padel UserSportProfile with dual-write',
  );

  const postJoin = readSrc('utils/postJoinOperations.ts');
  assert(
    postJoin.includes('ensureUserSportProfileForGame'),
    'postJoin ensures sport profile on game join (ADR-Q9)',
  );

  const controller = readSrc('controllers/game.controller.ts');
  assert(
    controller.includes('projectGameUsersForSportContext'),
    'telegram game path projects users for sport',
  );

  const stats = readSrc('controllers/user/stats.controller.ts');
  assert(stats.includes('resolveStatsSport'), 'getUserStats resolves sport context');
  assert(stats.includes('projectUserForSportContext'), 'stats controller projects user by sport');
  assert(stats.includes('getUserGameOutcomeAggregates(userId, sport)'), 'stats uses sport-scoped W/L aggregates');

  const outcomeStats = readSrc('services/user/userGameOutcomeStats.service.ts');
  assert(outcomeStats.includes('sport?: Sport'), 'outcome aggregates accept sport filter');

  const storyFeed = readSrc('services/story/story.feed.service.ts');
  assert(
    storyFeed.includes('projectUserForSportContext') && storyFeed.includes('resolveStoryBubbleSport'),
    'story feed projects bubble user level by sport',
  );

  const storyEvents = readSrc('services/story/story.events.ts');
  assert(storyEvents.includes('projectUserForSportContext'), 'story events project owner user by sport');

  const planner = readSrc('services/league/planner.service.ts');
  assert(
    planner.includes('seasonSport') && planner.includes('projectUserForSportContext'),
    'league planner projects sample users by season sport',
  );

  const levelChangeProjection = readSrc('services/levelChange/projection.service.ts');
  assert(
    levelChangeProjection.includes('projectGameUsersForSportContext'),
    'level history game embeds project nested users by game sport',
  );

  const resultsService = readSrc('services/results.service.ts');
  assert(
    resultsService.includes('projectGameUsersForSportContext') &&
      resultsService.includes('USER_SELECT_WITH_SPORT_PROFILES'),
    'getGameResults projects nested users by game sport',
  );
  assert(
    resultsService.includes('projectRoundUsersForSportContext') &&
      resultsService.includes('projectMatchUsersForSportContext'),
    'getRoundResults/getMatchResults project nested users by game sport',
  );

  const userTeam = readSrc('services/userTeam.service.ts');
  assert(
    userTeam.includes('projectUserTeamForSportContext') && userTeam.includes('listTeamsForPlayerInvite(viewerId: string, sport?: Sport)'),
    'user teams for player invite project members by sport',
  );

  const basicUsersForMessage = readSrc('services/user/basicUsersForMessage.service.ts');
  assert(
    basicUsersForMessage.includes('resolveChatMessageSport') &&
      basicUsersForMessage.includes('projectUserForSportContext'),
    'basicUsersForMessage projects users by chat sport context',
  );

  const userChat = readSrc('services/chat/userChat.service.ts');
  assert(
    userChat.includes('projectUserByPrimarySport') && userChat.includes('projectUserChatUsers'),
    'user chat surfaces project user1/user2 by primary sport',
  );
}

function testResolveSnapshotUnit(): void {
  const user = {
    level: 5.0,
    reliability: 80,
    gamesPlayed: 100,
    gamesWon: 50,
    sportProfiles: [{ sport: Sport.TENNIS, level: 2.5, reliability: 10, gamesPlayed: 3, gamesWon: 1 }],
  };
  const tennis = resolveUserSportSnapshot(user, Sport.TENNIS);
  assert(tennis.level === 2.5, 'snapshot prefers sport profile over global level');
  const padel = resolveUserSportSnapshot(user, Sport.PADEL);
  assert(padel.level === 5.0, 'padel without profile falls back to User.level');

  const legacyNoProfiles = {
    level: 5.0,
    reliability: 80,
    gamesPlayed: 100,
    gamesWon: 50,
  };
  const tennisLegacy = resolveUserSportSnapshot(legacyNoProfiles, Sport.TENNIS);
  assert(tennisLegacy.level === 1.0, 'non-padel without sportProfiles defaults to 1.0');
  assert(tennisLegacy.gamesPlayed === 0, 'non-padel without sportProfiles defaults gamesPlayed to 0');

  const emptyProfiles = {
    level: 3.2,
    reliability: 40,
    gamesPlayed: 12,
    gamesWon: 7,
    sportProfiles: [] as typeof user.sportProfiles,
  };
  const fromEmptyProfiles = resolveUserSportSnapshot(emptyProfiles, Sport.TENNIS);
  assert(fromEmptyProfiles.level === 1.0, 'non-padel with empty sportProfiles uses default snapshot');

  const { generateResultsHTML } = require('../../src/services/telegram/results-html.service') as {
    generateResultsHTML: (game: unknown, lang?: string) => string;
  };
  const html = generateResultsHTML(
    {
      sport: Sport.TENNIS,
      affectsRating: true,
      outcomes: [
        {
          id: 'o1',
          userId: 'u1',
          levelBefore: 2,
          levelAfter: 2.1,
          levelChange: 0.1,
          reliabilityBefore: 10,
          reliabilityAfter: 11,
          reliabilityChange: 1,
          pointsEarned: 0,
          position: 1,
          isWinner: true,
          user: {
            id: 'u1',
            firstName: 'Test',
            lastName: 'User',
            avatar: null,
            level: 4.3,
          },
        },
      ],
    },
    'en-GB',
  );
  assert(html.includes('4.3'), 'results HTML keeps projected sport level on badge');
}

function main(): void {
  testSourcePatches();
  testResolveSnapshotUnit();
  console.log('multisport-trust-patches: OK');
}

main();
