import { MessageType, ParticipantRole, Sport, StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';
import type { BasicUser } from '../../types/user.types';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import { resolveSport } from '../../sport/sportRegistry';
import {
  ACTIVITY_WINDOW_MS,
  MAX_BUBBLES,
  MAX_SEGMENTS_PER_USER,
  QUERY_ROW_CAP,
  SOURCE_PRIORITY,
} from './story.constants';
import {
  canSeeCreatedGameInStories,
  canSeeManualStory,
  canSeePhotoInStories,
  canSeeResultInStories,
} from './story.permissions';
import { isStoryItemMediaInvalid } from './story.validate.service';
import { MAIN_PHOTO_RELATION_SELECT } from '../game/read.service';
import {
  buildStoryResultMatchesForPlayer,
  loadStoryResultMatchesByGame,
  type StoryResultMatch,
} from './story.resultDetails.service';
import { batchSegmentEngagementCounts } from '../storyEngagement/storyEngagement.feedCounts';
import { resolveCaptionForStorySegment } from '../storyEngagement/storyEngagement.caption';
import { segmentEngagementKey } from '../storyEngagement/storyEngagement.constants';
import {
  BracketChampionStoryService,
  type BracketChampionStoryBracket,
} from './bracketChampionStory.service';

export type SegmentEngagement = {
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  viewerHasCommented: boolean;
  caption: string | null;
};

export type GameStorySummary = {
  id: string;
  name: string | null;
  entityType: string;
  sport: string;
  gameType: string;
  startTime: string;
  endTime: string;
  status: string;
  isPublic: boolean;
  cityId: string;
  clubId: string | null;
  avatar: string | null;
  mainPhoto?: { thumbnailUrl: string; originalUrl: string } | null;
  maxParticipants: number;
  cityName?: string | null;
  clubName?: string | null;
  participantCount?: number;
  telegramResultsSummary?: string | null;
};

export type ResultSummary = {
  isWinner: boolean;
  position: number | null;
  wins: number;
  losses: number;
  ties: number;
  scoresMade: number;
  scoresLost: number;
  pointsEarned: number;
  winnerOfGame: string;
  levelChange: number | null;
  matches: StoryResultMatch[];
};

type ManualMedia = {
  url: string;
  thumbnailUrl: string;
  type: 'IMAGE' | 'VIDEO';
  durationMs?: number;
  width?: number;
  height?: number;
  overlayText?: string;
  overlayStyle?: unknown;
};

type PhotoMedia = {
  url: string;
  thumbnailUrl: string;
  type: 'IMAGE';
  width?: number;
  height?: number;
};

export type StorySegment =
  | {
      key: string;
      sourceType: 'USER_STORY_ITEM';
      viewed: boolean;
      createdAt: string;
      media: ManualMedia;
      engagement?: SegmentEngagement;
    }
  | {
      key: string;
      sourceType: 'GAME_PHOTO';
      viewed: boolean;
      createdAt: string;
      media: PhotoMedia;
      game: GameStorySummary;
      engagement?: SegmentEngagement;
    }
  | {
      key: string;
      sourceType: 'GAME_CREATED';
      viewed: boolean;
      createdAt: string;
      game: GameStorySummary;
      engagement?: SegmentEngagement;
    }
  | {
      key: string;
      sourceType: 'GAME_RESULT';
      viewed: boolean;
      createdAt: string;
      game: GameStorySummary;
      result: ResultSummary;
      engagement?: SegmentEngagement;
    }
  | {
      key: string;
      sourceType: 'BRACKET_CHAMPION';
      viewed: boolean;
      createdAt: string;
      leagueName: string;
      championTeamLabel: string;
      bracket: BracketChampionStoryBracket;
      game: GameStorySummary;
      engagement?: SegmentEngagement;
    };

export type StoryFeed = {
  serverTime: string;
  bubbles: Array<{
    user: BasicUser;
    isSelf: boolean;
    hasUnseen: boolean;
    previewThumbnailUrl: string | null;
    segments: StorySegment[];
  }>;
};

type RawSegment = {
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
  gameId?: string;
  createdAt: Date;
  previewThumbnailUrl: string | null;
  segment: StorySegment;
  manualCaption?: string | null;
};

export function segmentKey(sourceType: StorySourceType | string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

const GAME_STORY_GAME_SELECT = {
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
  mainPhotoId: true,
  resultsSentToTelegram: true,
  resultsSummaryText: true,
  telegramResultsSummary: true,
  resultsArtifactsReadyAt: true,
  city: { select: { name: true } },
  club: { select: { name: true } },
  court: { select: { club: { select: { name: true } } } },
  _count: {
    select: {
      participants: { where: { status: 'PLAYING' } },
    },
  },
  mainPhoto: MAIN_PHOTO_RELATION_SELECT,
} as const;

type GameStoryGameRow = {
  id: string;
  name: string | null;
  entityType: string;
  sport: string;
  gameType: string;
  startTime: Date;
  endTime: Date;
  status: string;
  isPublic: boolean;
  cityId: string;
  clubId: string | null;
  avatar: string | null;
  maxParticipants: number;
  createdAt?: Date;
  finishedDate?: Date | null;
  resultsStatus?: string;
  mainPhotoId?: string | null;
  resultsSentToTelegram?: boolean;
  resultsSummaryText?: string | null;
  telegramResultsSummary?: string | null;
  resultsArtifactsReadyAt?: Date | null;
  city?: { name: string } | null;
  club?: { name: string } | null;
  court?: { club: { name: string } | null } | null;
  _count?: { participants: number };
  mainPhoto?: { id: string; thumbnailUrl: string; originalUrl: string } | null;
};

/** Story bubble preview / activity slide backdrop: main photo when set, else game avatar. */
export function storyGameBackdropUrl(game: {
  avatar: string | null;
  mainPhoto?: { thumbnailUrl: string } | null;
}): string | null {
  return game.mainPhoto?.thumbnailUrl ?? game.avatar ?? null;
}

const STORY_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

function resolveStoryBubbleSport(
  segments: StorySegment[],
  user: { primarySport?: Sport | string | null },
): Sport {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if ('game' in seg && seg.game?.sport) {
      return resolveSport(seg.game.sport);
    }
  }
  return resolveSport(user.primarySport ?? Sport.PADEL);
}

function toBasicUser(u: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
}): BasicUser {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
    level: u.level,
    socialLevel: u.socialLevel,
    gender: u.gender,
    approvedLevel: u.approvedLevel,
    isTrainer: u.isTrainer,
  };
}

export function toGameSummary(game: GameStoryGameRow): GameStorySummary {
  const clubName = game.club?.name ?? game.court?.club?.name ?? null;
  const telegramSummary = game.resultsSummaryText?.trim() ?? null;
  return {
    id: game.id,
    name: game.name,
    entityType: game.entityType,
    sport: game.sport,
    gameType: game.gameType,
    startTime: game.startTime.toISOString(),
    endTime: game.endTime.toISOString(),
    status: game.status,
    isPublic: game.isPublic,
    cityId: game.cityId,
    clubId: game.clubId,
    avatar: game.avatar,
    mainPhoto: game.mainPhoto
      ? {
          thumbnailUrl: game.mainPhoto.thumbnailUrl,
          originalUrl: game.mainPhoto.originalUrl,
        }
      : null,
    maxParticipants: game.maxParticipants,
    cityName: game.city?.name ?? null,
    clubName,
    participantCount: game._count?.participants,
    telegramResultsSummary: telegramSummary,
  };
}

export function formatManualSegment(item: {
  id: string;
  mediaUrl: string;
  thumbnailUrl: string;
  messageType: MessageType;
  videoDurationMs: number | null;
  width: number | null;
  height: number | null;
  overlayText: string | null;
  overlayStyle: unknown;
  createdAt: Date;
}): StorySegment {
  const type = item.messageType === MessageType.VIDEO ? 'VIDEO' : 'IMAGE';
  return {
    key: segmentKey(StorySourceType.USER_STORY_ITEM, item.id),
    sourceType: 'USER_STORY_ITEM',
    viewed: false,
    createdAt: item.createdAt.toISOString(),
    media: {
      url: item.mediaUrl,
      thumbnailUrl: item.thumbnailUrl,
      type,
      ...(type === 'VIDEO' && item.videoDurationMs != null ? { durationMs: item.videoDurationMs } : {}),
      ...(item.width != null ? { width: item.width } : {}),
      ...(item.height != null ? { height: item.height } : {}),
      ...(item.overlayText ? { overlayText: item.overlayText } : {}),
      ...(item.overlayStyle != null ? { overlayStyle: item.overlayStyle } : {}),
    },
  };
}

function dedupByGameId(segments: RawSegment[]): RawSegment[] {
  const byGame = new Map<string, RawSegment>();
  const withoutGame: RawSegment[] = [];

  for (const seg of segments) {
    if (!seg.gameId) {
      withoutGame.push(seg);
      continue;
    }
    const existing = byGame.get(seg.gameId);
    if (!existing) {
      byGame.set(seg.gameId, seg);
      continue;
    }
    const existingPri = SOURCE_PRIORITY[existing.sourceType] ?? 0;
    const newPri = SOURCE_PRIORITY[seg.sourceType] ?? 0;
    if (newPri > existingPri) {
      byGame.set(seg.gameId, seg);
    }
  }

  return [...withoutGame, ...byGame.values()];
}

function capSegments(segments: RawSegment[]): RawSegment[] {
  if (segments.length <= MAX_SEGMENTS_PER_USER) return segments;
  const sorted = [...segments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted.slice(0, MAX_SEGMENTS_PER_USER).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export class StoryFeedService {
  static async getFeed(viewerId: string): Promise<StoryFeed> {
    const now = new Date();
    const activitySince = new Date(now.getTime() - ACTIVITY_WINDOW_MS);

    const favorites = await prisma.userFavoriteUser.findMany({
      where: { userId: viewerId },
      select: { favoriteUserId: true },
    });
    const followedIds = new Set(favorites.map((f) => f.favoriteUserId));
    const followingIds = [...new Set([...followedIds, viewerId])];
    const activityOwnerIds = [...followedIds];

    const viewedRows = await prisma.storyView.findMany({
      where: { viewerId },
      select: { sourceType: true, sourceId: true },
    });
    const viewedSet = new Set(viewedRows.map((v) => segmentKey(v.sourceType, v.sourceId)));

    const rawSegments: RawSegment[] = [];

    const manualItems = await prisma.userStoryItem.findMany({
      where: {
        deletedAt: null,
        story: {
          userId: { in: followingIds },
          expiresAt: { gt: now },
        },
      },
      include: {
        story: { select: { userId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: QUERY_ROW_CAP,
    });

    for (const item of manualItems) {
      if (
        isStoryItemMediaInvalid({
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl,
          posterUrl: item.posterUrl,
        })
      ) {
        continue;
      }
      const ownerUserId = item.story.userId;
      const viewerFollows = ownerUserId === viewerId || followedIds.has(ownerUserId);
      if (!canSeeManualStory(viewerFollows)) continue;
      const seg = formatManualSegment(item);
      seg.viewed = viewedSet.has(seg.key);
      rawSegments.push({
        ownerUserId,
        sourceType: StorySourceType.USER_STORY_ITEM,
        sourceId: item.id,
        createdAt: item.createdAt,
        previewThumbnailUrl: item.thumbnailUrl,
        segment: seg,
        manualCaption: item.caption,
      });
    }

    if (activityOwnerIds.length > 0) {
      const photos = await prisma.gamePhoto.findMany({
        where: {
          uploaderId: { in: activityOwnerIds },
          deletedAt: null,
          createdAt: { gte: activitySince },
        },
        include: {
          game: {
            select: {
              ...GAME_STORY_GAME_SELECT,
            },
          },
          uploader: {
            select: {
              id: true,
              shareGamePhotosToFollowers: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: QUERY_ROW_CAP,
      });

      for (const photo of photos) {
        if (!photo.uploaderId || !photo.uploader) continue;
        const viewerFollows = followedIds.has(photo.uploaderId);
        if (
          !canSeePhotoInStories({
            viewerFollows,
            game: photo.game,
            uploader: photo.uploader,
          })
        ) {
          continue;
        }
        const key = segmentKey(StorySourceType.GAME_PHOTO, photo.id);
        const seg: StorySegment = {
          key,
          sourceType: 'GAME_PHOTO',
          viewed: viewedSet.has(key),
          createdAt: photo.createdAt.toISOString(),
          media: {
            url: photo.originalUrl,
            thumbnailUrl: photo.thumbnailUrl,
            type: 'IMAGE',
            ...(photo.width != null ? { width: photo.width } : {}),
            ...(photo.height != null ? { height: photo.height } : {}),
          },
          game: toGameSummary(photo.game),
        };
        rawSegments.push({
          ownerUserId: photo.uploaderId,
          sourceType: StorySourceType.GAME_PHOTO,
          sourceId: photo.id,
          gameId: photo.gameId,
          createdAt: photo.createdAt,
          previewThumbnailUrl: photo.thumbnailUrl,
          segment: seg,
        });
      }

      const ownerParticipants = await prisma.gameParticipant.findMany({
        where: {
          userId: { in: activityOwnerIds },
          role: ParticipantRole.OWNER,
          game: {
            isPublic: true,
            status: 'ANNOUNCED',
            entityType: { not: 'LEAGUE_SEASON' },
            createdAt: { gte: activitySince },
          },
        },
        include: {
          game: {
            select: GAME_STORY_GAME_SELECT,
          },
          user: {
            select: {
              id: true,
              shareGameCreationsToFollowers: true,
            },
          },
        },
        take: QUERY_ROW_CAP,
      });

      for (const row of ownerParticipants) {
        const ownerUserId = row.userId;
        const viewerFollows = followedIds.has(ownerUserId);
        if (
          !canSeeCreatedGameInStories({
            viewerFollows,
            game: row.game,
            owner: row.user,
          })
        ) {
          continue;
        }
        const key = segmentKey(StorySourceType.GAME_CREATED, row.game.id);
        const preview = storyGameBackdropUrl(row.game);
        const seg: StorySegment = {
          key,
          sourceType: 'GAME_CREATED',
          viewed: viewedSet.has(key),
          createdAt: row.game.createdAt.toISOString(),
          game: toGameSummary(row.game),
        };
        rawSegments.push({
          ownerUserId,
          sourceType: StorySourceType.GAME_CREATED,
          sourceId: row.game.id,
          gameId: row.game.id,
          createdAt: row.game.createdAt,
          previewThumbnailUrl: preview,
          segment: seg,
        });
      }

      const outcomes = await prisma.gameOutcome.findMany({
        where: {
          userId: { in: activityOwnerIds },
          game: {
            isPublic: true,
            resultsStatus: 'FINAL',
            resultsArtifactsReadyAt: { not: null },
            finishedDate: { gte: activitySince },
          },
        },
        include: {
          game: {
            select: GAME_STORY_GAME_SELECT,
          },
          user: {
            select: {
              id: true,
              shareGameResultsToFollowers: true,
            },
          },
        },
        take: QUERY_ROW_CAP,
      });

      const pendingResults: Array<{
        ownerUserId: string;
        outcome: (typeof outcomes)[number];
      }> = [];

      for (const outcome of outcomes) {
        const ownerUserId = outcome.userId;
        const viewerFollows = followedIds.has(ownerUserId);
        if (
          !canSeeResultInStories({
            viewerFollows,
            game: outcome.game,
            outcomeOwner: outcome.user,
          })
        ) {
          continue;
        }
        pendingResults.push({ ownerUserId, outcome });
      }

      const resultGameIds = [...new Set(pendingResults.map((p) => p.outcome.game.id))];
      const gamesWithRounds = await loadStoryResultMatchesByGame(resultGameIds);

      for (const { ownerUserId, outcome } of pendingResults) {
        const createdAt = outcome.game.finishedDate ?? outcome.createdAt;
        const key = segmentKey(StorySourceType.GAME_RESULT, outcome.game.id);
        const preview = storyGameBackdropUrl(outcome.game);
        const gameRounds = gamesWithRounds.get(outcome.game.id);
        const matches =
          gameRounds != null
            ? buildStoryResultMatchesForPlayer(gameRounds, ownerUserId)
            : [];
        const seg: StorySegment = {
          key,
          sourceType: 'GAME_RESULT',
          viewed: viewedSet.has(key),
          createdAt: createdAt.toISOString(),
          game: toGameSummary(outcome.game),
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
        };
        rawSegments.push({
          ownerUserId,
          sourceType: StorySourceType.GAME_RESULT,
          sourceId: outcome.game.id,
          gameId: outcome.game.id,
          createdAt,
          previewThumbnailUrl: preview,
          segment: seg,
        });
      }

      const bracketChampionSegs = await BracketChampionStoryService.loadRawSegments({
        activityOwnerIds,
        followedIds,
        activitySince,
        viewedSet,
      });
      rawSegments.push(...bracketChampionSegs);
    }

    const byOwner = new Map<string, RawSegment[]>();
    for (const seg of rawSegments) {
      const list = byOwner.get(seg.ownerUserId) ?? [];
      list.push(seg);
      byOwner.set(seg.ownerUserId, list);
    }

    const bubbleOwnerIds = [...byOwner.keys()];
    const users =
      bubbleOwnerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: bubbleOwnerIds } },
            select: STORY_USER_SELECT,
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    type BubbleDraft = {
      user: BasicUser;
      isSelf: boolean;
      hasUnseen: boolean;
      previewThumbnailUrl: string | null;
      segments: StorySegment[];
      latestAt: Date;
    };

    const bubbles: BubbleDraft[] = [];

    for (const [ownerUserId, segs] of byOwner) {
      const user = userById.get(ownerUserId);
      if (!user) continue;

      const isSelf = ownerUserId === viewerId;
      let ownerSegs = dedupByGameId(segs);
      if (isSelf) {
        ownerSegs = ownerSegs.filter((s) => s.sourceType === StorySourceType.USER_STORY_ITEM);
      }
      ownerSegs = capSegments(ownerSegs);
      if (ownerSegs.length === 0) continue;

      const segmentPayloads = ownerSegs.map((s) => s.segment);
      const bubbleSport = resolveStoryBubbleSport(segmentPayloads, user);
      const projectedUser = projectUserForSportContext(user, bubbleSport);
      const hasUnseen = segmentPayloads.some((s) => !s.viewed);
      const latestAt = ownerSegs.reduce(
        (max, s) => (s.createdAt > max ? s.createdAt : max),
        ownerSegs[0].createdAt
      );
      const previewThumbnailUrl =
        ownerSegs[ownerSegs.length - 1]?.previewThumbnailUrl ?? null;

      bubbles.push({
        user: toBasicUser(projectedUser),
        isSelf,
        hasUnseen,
        previewThumbnailUrl,
        segments: segmentPayloads,
        latestAt,
      });
    }

    bubbles.sort((a, b) => {
      if (a.isSelf && !b.isSelf) return -1;
      if (!a.isSelf && b.isSelf) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt.getTime() - a.latestAt.getTime();
    });

    const capped = bubbles.slice(0, MAX_BUBBLES).map(({ latestAt: _l, ...rest }) => rest);

    const segmentKeysForEngagement: Array<{ sourceType: StorySourceType; sourceId: string }> = [];
    const manualCaptionByKey = new Map<string, string | null>();
    for (const segs of byOwner.values()) {
      for (const raw of segs) {
        if (raw.manualCaption !== undefined) {
          manualCaptionByKey.set(raw.segment.key, raw.manualCaption);
        }
      }
    }
    for (const bubble of capped) {
      for (const seg of bubble.segments) {
        const [sourceType, sourceId] = seg.key.split(':') as [StorySourceType, string];
        segmentKeysForEngagement.push({ sourceType, sourceId });
      }
    }
    const engagementMap = await batchSegmentEngagementCounts(viewerId, segmentKeysForEngagement);
    for (const bubble of capped) {
      for (const seg of bubble.segments) {
        const [sourceType, sourceId] = seg.key.split(':') as [StorySourceType, string];
        const counts = engagementMap.get(segmentEngagementKey(sourceType, sourceId));
        seg.engagement = {
          likeCount: counts?.likeCount ?? 0,
          commentCount: counts?.commentCount ?? 0,
          viewerHasLiked: counts?.viewerHasLiked ?? false,
          viewerHasCommented: counts?.viewerHasCommented ?? false,
          caption: resolveCaptionForStorySegment(seg, manualCaptionByKey.get(seg.key), now),
        };
      }
    }

    return {
      serverTime: now.toISOString(),
      bubbles: capped,
    };
  }
}
