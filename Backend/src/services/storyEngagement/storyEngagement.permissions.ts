import { ParticipantRole, StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ACTIVITY_WINDOW_MS } from '../story/story.constants';
import {
  canSeeCreatedGameInStories,
  canSeeManualStory,
  canSeePhotoInStories,
  canSeeBracketChampionInStories,
  canSeeResultInStories,
} from '../story/story.permissions';
import {
  parseBracketChampionSourceId,
  resolveChampionTeamLabel,
} from '../story/bracketChampionStory.service';
import { BracketAdvancementService } from '../league/bracketAdvancement.service';
import { isStoryItemMediaInvalid } from '../story/story.validate.service';
import {
  SOCIAL_GRAPH_INTERACT_CONTEXT,
  assertCanInteract,
} from '../social-graph/socialGraph.block';
import { STORY_ENGAGEMENT_ERROR } from './storyEngagement.constants';
import type { CaptionContext } from './storyEngagement.caption';

export type StorySegmentRef = {
  sourceType: StorySourceType;
  sourceId: string;
  ownerUserId: string;
};

export type ResolvedStorySegment = StorySegmentRef & {
  captionContext: CaptionContext;
};

function segmentNotFound(): never {
  throw new ApiError(404, 'Story segment not found', true, {
    code: STORY_ENGAGEMENT_ERROR.SEGMENT_NOT_FOUND,
  });
}

function engagementForbidden(): never {
  throw new ApiError(403, 'Story engagement forbidden', true, {
    code: STORY_ENGAGEMENT_ERROR.FORBIDDEN,
  });
}

export async function viewerFollowsOwner(viewerId: string, ownerUserId: string): Promise<boolean> {
  if (viewerId === ownerUserId) return true;
  const fav = await prisma.userFavoriteUser.findFirst({
    where: { userId: viewerId, favoriteUserId: ownerUserId },
    select: { id: true },
  });
  return !!fav;
}

const GAME_CAPTION_SELECT = {
  id: true,
  name: true,
  sport: true,
  entityType: true,
  status: true,
  isPublic: true,
  resultsStatus: true,
  resultsArtifactsReadyAt: true,
  createdAt: true,
  club: { select: { name: true } },
  court: { select: { club: { select: { name: true } } } },
} as const;

function clubNameFromGame(game: {
  club?: { name: string } | null;
  court?: { club: { name: string } | null } | null;
}): string | null {
  return game.club?.name ?? game.court?.club?.name ?? null;
}

export async function resolveVisibleSegment(
  viewerId: string,
  ref: StorySegmentRef,
): Promise<ResolvedStorySegment> {
  const { sourceType, sourceId, ownerUserId } = ref;
  if (!sourceType || !sourceId || !ownerUserId) segmentNotFound();

  await assertCanInteract(viewerId, ownerUserId, SOCIAL_GRAPH_INTERACT_CONTEXT.STORY_ENGAGEMENT);
  const follows = await viewerFollowsOwner(viewerId, ownerUserId);
  const now = new Date();
  const activitySince = new Date(now.getTime() - ACTIVITY_WINDOW_MS);

  switch (sourceType) {
    case StorySourceType.USER_STORY_ITEM: {
      const item = await prisma.userStoryItem.findFirst({
        where: {
          id: sourceId,
          deletedAt: null,
          story: { userId: ownerUserId, expiresAt: { gt: now } },
        },
        select: { id: true, caption: true, mediaUrl: true, thumbnailUrl: true, posterUrl: true },
      });
      if (
        !item ||
        isStoryItemMediaInvalid({
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl,
          posterUrl: item.posterUrl,
        })
      ) {
        segmentNotFound();
      }
      if (!canSeeManualStory(follows)) {
        if (!follows) engagementForbidden();
        segmentNotFound();
      }
      return {
        sourceType,
        sourceId,
        ownerUserId,
        captionContext: { type: 'USER_STORY_ITEM', caption: item.caption },
      };
    }
    case StorySourceType.GAME_PHOTO: {
      const photo = await prisma.gamePhoto.findFirst({
        where: {
          id: sourceId,
          uploaderId: ownerUserId,
          deletedAt: null,
          createdAt: { gte: activitySince },
        },
        include: {
          game: { select: GAME_CAPTION_SELECT },
          uploader: { select: { shareGamePhotosToFollowers: true } },
        },
      });
      if (!photo?.uploader) segmentNotFound();
      if (!follows) engagementForbidden();
      if (
        !canSeePhotoInStories({
          viewerFollows: true,
          game: photo.game,
          uploader: photo.uploader,
        })
      ) {
        segmentNotFound();
      }
      return {
        sourceType,
        sourceId,
        ownerUserId,
        captionContext: {
          type: 'GAME_PHOTO',
          gameName: photo.game.name,
          sport: photo.game.sport,
          clubName: clubNameFromGame(photo.game),
        },
      };
    }
    case StorySourceType.GAME_CREATED: {
      const row = await prisma.gameParticipant.findFirst({
        where: {
          userId: ownerUserId,
          role: ParticipantRole.OWNER,
          gameId: sourceId,
          game: {
            isPublic: true,
            status: 'ANNOUNCED',
            entityType: { not: 'LEAGUE_SEASON' },
            createdAt: { gte: activitySince },
          },
        },
        include: {
          game: { select: GAME_CAPTION_SELECT },
          user: { select: { shareGameCreationsToFollowers: true } },
        },
      });
      if (!row) segmentNotFound();
      if (!follows) engagementForbidden();
      if (
        !canSeeCreatedGameInStories({
          viewerFollows: true,
          game: row.game,
          owner: row.user,
        })
      ) {
        segmentNotFound();
      }
      return {
        sourceType,
        sourceId,
        ownerUserId,
        captionContext: {
          type: 'GAME_CREATED',
          clubName: clubNameFromGame(row.game),
          createdAt: row.game.createdAt,
        },
      };
    }
    case StorySourceType.BRACKET_CHAMPION: {
      const { leagueRoundId, leagueGroupId } = parseBracketChampionSourceId(sourceId);
      const finalSlot = await prisma.leagueBracketSlot.findFirst({
        where: {
          leagueRoundId,
          leagueGroupId,
          slotKind: 'MAIN',
          winnerSlotId: null,
          game: {
            isPublic: true,
            resultsStatus: 'FINAL',
            finishedDate: { gte: activitySince },
          },
        },
        include: {
          game: { select: { id: true, isPublic: true, finishedDate: true } },
          leagueRound: {
            select: {
              leagueSeason: {
                include: {
                  league: { select: { name: true } },
                  game: { select: { id: true, isPublic: true } },
                },
              },
            },
          },
        },
      });
      if (!finalSlot?.gameId) segmentNotFound();
      const championParticipantId = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
        finalSlot.gameId
      );
      if (!championParticipantId) segmentNotFound();
      const roster = await prisma.leagueParticipant.findUnique({
        where: { id: championParticipantId },
        include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
      });
      const rosterIds =
        roster?.leagueTeam?.players
          .map((p) => p.userId)
          .filter((id): id is string => !!id) ?? [];
      if (!rosterIds.includes(ownerUserId)) segmentNotFound();
      const owner = await prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { shareGameResultsToFollowers: true },
      });
      if (!owner) segmentNotFound();
      if (!follows) engagementForbidden();
      const seasonGame = finalSlot.leagueRound.leagueSeason.game;
      const seasonParticipant = seasonGame
        ? await prisma.gameParticipant.findUnique({
            where: { userId_gameId: { userId: ownerUserId, gameId: seasonGame.id } },
            select: { showInStories: true },
          })
        : null;
      if (
        !seasonGame ||
        !canSeeBracketChampionInStories({
          viewerFollows: true,
          game: seasonGame,
          owner,
          participant: { showInStories: seasonParticipant?.showInStories ?? true },
        })
      ) {
        segmentNotFound();
      }
      const championTeamLabel = await resolveChampionTeamLabel(championParticipantId);
      return {
        sourceType,
        sourceId,
        ownerUserId,
        captionContext: {
          type: 'BRACKET_CHAMPION',
          leagueName: finalSlot.leagueRound.leagueSeason.league.name,
          championTeamLabel,
        },
      };
    }
    case StorySourceType.GAME_RESULT: {
      const outcome = await prisma.gameOutcome.findFirst({
        where: {
          userId: ownerUserId,
          gameId: sourceId,
          game: {
            isPublic: true,
            resultsStatus: 'FINAL',
            resultsArtifactsReadyAt: { not: null },
            finishedDate: { gte: activitySince },
          },
        },
        include: {
          game: { select: GAME_CAPTION_SELECT },
          user: { select: { shareGameResultsToFollowers: true } },
        },
      });
      if (!outcome) segmentNotFound();
      if (!follows) engagementForbidden();
      const resultParticipant = await prisma.gameParticipant.findUnique({
        where: { userId_gameId: { userId: ownerUserId, gameId: sourceId } },
        select: { showInStories: true },
      });
      if (
        !canSeeResultInStories({
          viewerFollows: true,
          game: outcome.game,
          outcomeOwner: outcome.user,
          participant: { showInStories: resultParticipant?.showInStories ?? true },
        })
      ) {
        segmentNotFound();
      }
      return {
        sourceType,
        sourceId,
        ownerUserId,
        captionContext: {
          type: 'GAME_RESULT',
          gameName: outcome.game.name,
          isWinner: outcome.isWinner,
          wins: outcome.wins,
          losses: outcome.losses,
        },
      };
    }
    default:
      segmentNotFound();
  }
}

export async function assertCanEngage(
  viewerId: string,
  refOrSourceType: StorySegmentRef | StorySourceType,
  sourceId?: string,
  ownerUserId?: string,
): Promise<ResolvedStorySegment> {
  const ref: StorySegmentRef =
    typeof refOrSourceType === 'string'
      ? { sourceType: refOrSourceType, sourceId: sourceId!, ownerUserId: ownerUserId! }
      : refOrSourceType;
  return resolveVisibleSegment(viewerId, ref);
}
