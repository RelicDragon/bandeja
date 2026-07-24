import {
  EntityType,
  StorySourceType,
  BracketSlotKind,
  BracketScope,
  PlayoffFormat,
  ResultsStatus,
} from '@prisma/client';
import prisma from '../../config/database';
import { ACTIVITY_WINDOW_MS } from './story.constants';
import { emitStoryDeleted, emitStoryNew } from './story.events';
import {
  canSeeBracketChampionInStories,
  canSeeResultInStories,
} from './story.permissions';
import {
  bracketChampionSourceId,
  resolveChampionTeamLabel,
} from './bracketChampionStory.service';
import type { BracketChampionStoryBracket } from './bracketChampionStory.service';
import { BracketAdvancementService } from '../league/bracketAdvancement.service';
import {
  buildStoryResultMatchesForPlayer,
  loadStoryResultMatchesByGame,
} from './story.resultDetails.service';
import { segmentKey, toGameSummary } from './story.feed.service';
import type { BracketScopeDto } from '../league/leagueBracketDeepLink.util';

/**
 * Keep followers' live story caches in sync when a player toggles per-game visibility.
 */
export async function syncParticipantShowInStoriesSideEffects(params: {
  gameId: string;
  userId: string;
  showInStories: boolean;
  entityType: EntityType;
}): Promise<void> {
  const resultKey = segmentKey(StorySourceType.GAME_RESULT, params.gameId);

  if (!params.showInStories) {
    await emitStoryDeleted(params.userId, resultKey);
    if (params.entityType === EntityType.LEAGUE_SEASON) {
      await forEachRecentSeasonChampionForUser(params.gameId, params.userId, async ({ sourceId }) => {
        await emitStoryDeleted(params.userId, segmentKey(StorySourceType.BRACKET_CHAMPION, sourceId));
      });
    }
    return;
  }

  await emitGameResultStoryIfEligible(params.gameId, params.userId);
  if (params.entityType === EntityType.LEAGUE_SEASON) {
    await emitRecentBracketChampionStoriesForSeasonPlayer(params.gameId, params.userId);
  }
}

async function emitGameResultStoryIfEligible(gameId: string, userId: string): Promise<void> {
  const activitySince = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  const outcome = await prisma.gameOutcome.findFirst({
    where: {
      gameId,
      userId,
      game: {
        isPublic: true,
        resultsStatus: 'FINAL',
        resultsArtifactsReadyAt: { not: null },
        finishedDate: { gte: activitySince },
      },
    },
    include: {
      game: {
        select: {
          id: true,
          name: true,
          entityType: true,
          sport: true,
          gameType: true,
          startTime: true,
          endTime: true,
          status: true,
          isPublic: true,
          cityId: true,
          clubId: true,
          avatar: true,
          maxParticipants: true,
          createdAt: true,
          finishedDate: true,
          resultsStatus: true,
          forbidOthersPhotosView: true,
          mainPhotoId: true,
          resultsSentToTelegram: true,
          resultsSummaryText: true,
          telegramResultsSummary: true,
          resultsArtifactsReadyAt: true,
          city: { select: { name: true } },
          club: { select: { name: true } },
          court: { select: { club: { select: { name: true } } } },
          _count: { select: { participants: { where: { status: 'PLAYING' } } } },
          mainPhoto: { select: { id: true, thumbnailUrl: true, originalUrl: true } },
          participants: { select: { userId: true, role: true } },
          parent: { select: { participants: { select: { userId: true, role: true } } } },
        },
      },
      user: { select: { shareGameResultsToFollowers: true } },
    },
  });
  if (!outcome) return;

  const participant = await prisma.gameParticipant.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { showInStories: true },
  });

  if (
    !canSeeResultInStories({
      viewerFollows: true,
      game: outcome.game,
      outcomeOwner: outcome.user,
      participant: { showInStories: participant?.showInStories ?? true },
    })
  ) {
    return;
  }

  const gamesWithRounds = await loadStoryResultMatchesByGame([gameId]);
  const gameRounds = gamesWithRounds.get(gameId);
  const matches =
    gameRounds != null ? buildStoryResultMatchesForPlayer(gameRounds, userId) : [];
  const createdAt = outcome.game.finishedDate ?? outcome.createdAt;
  const viewer = { id: userId, isAdmin: false };
  await emitStoryNew(userId, {
    key: segmentKey(StorySourceType.GAME_RESULT, gameId),
    sourceType: 'GAME_RESULT',
    viewed: false,
    createdAt: createdAt.toISOString(),
    game: toGameSummary(outcome.game, viewer),
    result: {
      isWinner: outcome.isWinner,
      position: outcome.position,
      wins: outcome.wins,
      losses: outcome.losses,
      ties: outcome.ties,
      scoresMade: outcome.scoresMade,
      scoresLost: outcome.scoresLost,
      pointsEarned: outcome.pointsEarned,
      winnerOfGame: gameRounds?.winnerOfGame ?? 'BY_MATCHES_WON',
      levelChange: outcome.levelChange,
      matches,
    },
  });
}

async function emitRecentBracketChampionStoriesForSeasonPlayer(
  seasonGameId: string,
  userId: string
): Promise<void> {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, shareGameResultsToFollowers: true },
  });
  if (!owner) return;

  const participant = await prisma.gameParticipant.findUnique({
    where: { userId_gameId: { userId, gameId: seasonGameId } },
    select: { showInStories: true },
  });

  await forEachRecentSeasonChampionForUser(seasonGameId, userId, async (ctx) => {
    if (
      !canSeeBracketChampionInStories({
        viewerFollows: true,
        game: ctx.seasonGame,
        owner,
        participant: { showInStories: participant?.showInStories ?? true },
      })
    ) {
      return;
    }

    const championTeamLabel = await resolveChampionTeamLabel(ctx.championParticipantId);
    const createdAt = ctx.finishedDate ?? new Date();
    const bracketScope: BracketScopeDto =
      ctx.bracketScope === BracketScope.CROSS_GROUP ? 'CROSS_GROUP' : 'PER_GROUP';
    const bracket: BracketChampionStoryBracket = {
      leagueSeasonId: ctx.leagueSeasonId,
      leagueRoundId: ctx.leagueRoundId,
      leagueGroupId: ctx.leagueGroupId,
      bracketScope,
    };
    const viewer = { id: userId, isAdmin: false };
    await emitStoryNew(userId, {
      key: segmentKey(StorySourceType.BRACKET_CHAMPION, ctx.sourceId),
      sourceType: 'BRACKET_CHAMPION',
      viewed: false,
      createdAt: createdAt.toISOString(),
      leagueName: ctx.leagueName,
      championTeamLabel,
      bracket,
      game: toGameSummary(ctx.seasonGame, viewer),
    });
  });
}

type SeasonChampionCtx = {
  sourceId: string;
  leagueRoundId: string;
  leagueGroupId: string | null;
  leagueSeasonId: string;
  leagueName: string;
  championParticipantId: string;
  finishedDate: Date | null;
  bracketScope: BracketScope;
  seasonGame: Parameters<typeof toGameSummary>[0];
};

async function forEachRecentSeasonChampionForUser(
  seasonGameId: string,
  userId: string,
  fn: (ctx: SeasonChampionCtx) => Promise<void>
): Promise<void> {
  const activitySince = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  // LeagueSeason.id === season Game.id (shared primary key).
  const season = await prisma.leagueSeason.findUnique({
    where: { id: seasonGameId },
    select: {
      id: true,
      league: { select: { name: true } },
      game: {
        select: {
          id: true,
          isPublic: true,
          name: true,
          entityType: true,
          sport: true,
          gameType: true,
          startTime: true,
          endTime: true,
          status: true,
          cityId: true,
          clubId: true,
          avatar: true,
          maxParticipants: true,
          resultsStatus: true,
          forbidOthersPhotosView: true,
          mainPhotoId: true,
          city: { select: { name: true } },
          club: { select: { name: true } },
          court: { select: { club: { select: { name: true } } } },
          _count: { select: { participants: { where: { status: 'PLAYING' } } } },
          mainPhoto: { select: { id: true, thumbnailUrl: true, originalUrl: true } },
          participants: { select: { userId: true, role: true } },
          parent: { select: { participants: { select: { userId: true, role: true } } } },
        },
      },
    },
  });
  if (!season?.game) return;

  const slots = await prisma.leagueBracketSlot.findMany({
    where: {
      leagueRound: {
        leagueSeasonId: season.id,
        playoffFormat: PlayoffFormat.BRACKET,
      },
      OR: [
        {
          slotKind: BracketSlotKind.GRAND_FINAL,
          game: { resultsStatus: ResultsStatus.FINAL, finishedDate: { gte: activitySince } },
        },
        {
          slotKind: BracketSlotKind.MAIN,
          winnerSlotId: null,
          game: { resultsStatus: ResultsStatus.FINAL, finishedDate: { gte: activitySince } },
        },
      ],
    },
    select: {
      leagueRoundId: true,
      leagueGroupId: true,
      gameId: true,
      game: { select: { finishedDate: true } },
      leagueRound: { select: { bracketScope: true } },
    },
    take: 50,
  });

  for (const slot of slots) {
    if (!slot.gameId) continue;
    const championParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
      slot.gameId
    );
    if (!championParticipantId) continue;
    const roster = await prisma.leagueParticipant.findUnique({
      where: { id: championParticipantId },
      include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
    });
    const rosterIds =
      roster?.leagueTeam?.players
        .map((p) => p.userId)
        .filter((id): id is string => !!id) ?? [];
    if (!rosterIds.includes(userId)) continue;

    await fn({
      sourceId: bracketChampionSourceId(slot.leagueRoundId, slot.leagueGroupId),
      leagueRoundId: slot.leagueRoundId,
      leagueGroupId: slot.leagueGroupId,
      leagueSeasonId: season.id,
      leagueName: season.league.name,
      championParticipantId,
      finishedDate: slot.game?.finishedDate ?? null,
      bracketScope: slot.leagueRound.bracketScope,
      seasonGame: season.game as Parameters<typeof toGameSummary>[0],
    });
  }
}
