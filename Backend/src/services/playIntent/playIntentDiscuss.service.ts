import { MatchProposalStatus, PlayIntentStatus, PlayIntentTimeOfDay } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { extractTranslationLanguageCode } from '../chat/resolveTranslationTargetLanguage';
import { findOrCreateExactMemberGroup } from '../chat/groupChannelExactMembers';
import { PlayIntentService } from './playIntent.service';
import { buildPlayIntentDiscussionName } from './playIntentDiscussionName';
import { intentWindowIsReachable } from './playIntentFreshness';
import {
  normalizeDiscussUserIds,
  pickDiscussProposal,
} from './normalizeDiscussUserIds';

export class PlayIntentDiscussService {
  static async openGroup(viewerId: string, userIds: string[]) {
    const otherUserIds = normalizeDiscussUserIds(viewerId, userIds);
    if (otherUserIds.length < 2) {
      throw new ApiError(400, 'playIntent.discussNeedGroup', true, {
        code: 'playIntent.discussNeedGroup',
      });
    }
    if (otherUserIds.length > 15) {
      throw new ApiError(400, 'playIntent.discussTooMany', true, {
        code: 'playIntent.discussTooMany',
      });
    }

    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { language: true, currentCityId: true },
    });
    if (!viewer?.currentCityId) {
      throw new ApiError(400, 'City is required');
    }

    const intent = await PlayIntentService.getMyActiveIntent(
      viewerId,
      viewer.currentCityId,
    );
    if (!intent) {
      throw new ApiError(400, 'playIntent.discussUnavailable', true, {
        code: 'playIntent.discussUnavailable',
      });
    }

    const now = new Date();
    const [looking, rawProposals] = await Promise.all([
      prisma.playIntent.findMany({
        where: {
          cityId: intent.cityId,
          sport: intent.sport,
          entityType: intent.entityType,
          userId: { in: otherUserIds },
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
          expiresAt: { gt: now },
        },
        select: {
          userId: true,
          dateKeys: true,
          timeOfDay: true,
          timeOfDays: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.matchProposal.findMany({
        where: {
          cityId: intent.cityId,
          sport: intent.sport,
          entityType: intent.entityType,
          status: {
            in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
          },
          expiresAt: { gt: now },
          gameId: null,
          members: { some: { userId: viewerId } },
        },
        select: {
          dateKeys: true,
          startTime: true,
          endTime: true,
          clubIds: true,
          members: { select: { userId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const proposal = pickDiscussProposal(rawProposals, otherUserIds);
    const timezone = intent.city.timezone;
    const allowed = new Set([
      ...looking
        .filter((row) => intentWindowIsReachable(row, timezone, now))
        .map((row) => row.userId),
      ...(proposal?.members.map((member) => member.userId) ?? []),
    ]);
    for (const userId of otherUserIds) {
      if (!allowed.has(userId)) {
        throw new ApiError(403, 'playIntent.discussNotInLobby', true, {
          code: 'playIntent.discussNotInLobby',
        });
      }
    }

    const naming = proposal ?? intent;
    const useProposalClock = !!(proposal?.startTime && proposal?.endTime);
    const clubs = naming.clubIds.length
      ? await prisma.club.findMany({
          where: { id: { in: naming.clubIds } },
          select: { id: true, name: true },
        })
      : [];
    const clubById = new Map(clubs.map((club) => [club.id, club.name]));
    const clubNames = naming.clubIds
      .map((clubId) => clubById.get(clubId))
      .filter((name): name is string => !!name);

    const name = buildPlayIntentDiscussionName({
      timezone,
      dateKeys: naming.dateKeys,
      timeOfDay: useProposalClock
        ? PlayIntentTimeOfDay.CUSTOM
        : intent.timeOfDay,
      timeOfDays: useProposalClock
        ? [PlayIntentTimeOfDay.CUSTOM]
        : intent.timeOfDays,
      startTime: useProposalClock && proposal ? proposal.startTime : intent.startTime,
      endTime: useProposalClock && proposal ? proposal.endTime : intent.endTime,
      clubNames,
      lang: extractTranslationLanguageCode(viewer.language),
    });

    return findOrCreateExactMemberGroup({
      ownerId: viewerId,
      memberIds: [viewerId, ...otherUserIds],
      name,
    });
  }
}
