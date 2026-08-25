import {
  EntityType,
  MatchProposalStatus,
  ParticipantStatus,
  PlayIntentStatus,
  type Sport,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { assertCanInviteToGame } from '../game/canInviteToGame';
import { PlayIntentService } from './playIntent.service';
import { PlayIntentMatchService } from './playIntentMatch.service';
import { gameMatchScore, timeStringToMinutes, type FitCheck, type IntentMismatch } from './playIntentCriteria';
import { intentWindowIsReachable } from './playIntentFreshness';
import { rankInvitePoolMembers } from './playIntentInvitePoolRanking';
import { countGamesTogetherWith } from '../user/gamesTogetherCount';

const BLOCKING_PARTICIPANT_STATUSES = new Set<ParticipantStatus>([
  ParticipantStatus.PLAYING,
  ParticipantStatus.NON_PLAYING,
  ParticipantStatus.IN_QUEUE,
  ParticipantStatus.GUEST,
  ParticipantStatus.INVITED,
]);

const intentUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  gender: true,
  sportProfiles: { select: { sport: true, level: true } },
} as const;

export function invitePoolIntentEntityType(entityType: EntityType | string): EntityType {
  return entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME;
}

export type InvitePoolDraft = {
  sport: Sport;
  entityType?: EntityType | string;
  cityId?: string | null;
  clubId?: string | null;
  startTime: string;
  endTime?: string;
  timeZone?: string | null;
  minLevel?: number | null;
  maxLevel?: number | null;
  genderTeams?: string | null;
};

export type InvitePoolMember = {
  userId: string;
  intentId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  gender: string | null;
  level: number | null;
  status: PlayIntentStatus;
  inProposal: boolean;
  inGame: boolean;
  matchesGame: boolean;
  fit: FitCheck[];
  mismatch: IntentMismatch | null;
  gamesTogetherCount: number;
  matchScore: number;
};

export type InvitePool = {
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  members: InvitePoolMember[];
  total: number;
};

async function blockedUserIds(viewerId: string): Promise<Set<string>> {
  const blocked = await prisma.blockedUser.findMany({
    where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
    select: { userId: true, blockedUserId: true },
  });
  const ids = new Set<string>();
  for (const row of blocked) {
    if (row.userId === viewerId) ids.add(row.blockedUserId);
    if (row.blockedUserId === viewerId) ids.add(row.userId);
  }
  return ids;
}

async function buildPool(input: {
  viewerId: string;
  cityId: string;
  timezone: string;
  sport: Sport;
  entityType: EntityType;
  dateKey: string;
  clubId: string | null;
  startTime: Date;
  startTimeMinutes: number;
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: string | null;
  excludeUserIds: Set<string>;
}): Promise<InvitePool> {
  const now = new Date();
  const foundIntents = await prisma.playIntent.findMany({
    where: {
      cityId: input.cityId,
      sport: input.sport,
      entityType: input.entityType,
      status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
      expiresAt: { gt: now },
      userId: { not: input.viewerId },
    },
    include: { user: { select: intentUserSelect } },
  });
  const intents = foundIntents.filter((intent) =>
    intentWindowIsReachable(intent, input.timezone, now),
  );
  if (intents.length === 0) {
    return {
      cityId: input.cityId,
      sport: input.sport,
      entityType: input.entityType,
      members: [],
      total: 0,
    };
  }
  const blocked = await blockedUserIds(input.viewerId);
  const proposalMembers = await prisma.matchProposalMember.findMany({
    where: {
      intentId: { in: intents.map((intent) => intent.id) },
      proposal: {
        status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
        expiresAt: { gt: now },
        gameId: null,
      },
    },
    select: { userId: true },
  });
  const inProposalIds = new Set(proposalMembers.map((row) => row.userId));
  const busyUserIds = await PlayIntentMatchService.usersBusyPlaying(
    intents.map((intent) => intent.userId),
    [input.dateKey],
    input.cityId,
  );
  const together = await countGamesTogetherWith(
    input.viewerId,
    intents.map((intent) => intent.userId),
  );
  const gameCriteria = {
    entityType: input.entityType,
    dateKey: input.dateKey,
    clubId: input.clubId,
    startTime: input.startTime,
    startTimeMinutes: input.startTimeMinutes,
    minLevel: input.minLevel,
    maxLevel: input.maxLevel,
    genderTeams: input.genderTeams,
  };

  const members: InvitePoolMember[] = [];
  for (const intent of intents) {
    if (blocked.has(intent.userId)) continue;
    if (input.excludeUserIds.has(intent.userId)) continue;
    const criteria = PlayIntentService.toCriteria(intent);
    const scored = gameMatchScore(criteria, gameCriteria, now);
    const profile = intent.user.sportProfiles.find((p) => p.sport === input.sport);
    members.push({
      userId: intent.user.id,
      intentId: intent.id,
      firstName: intent.user.firstName,
      lastName: intent.user.lastName,
      avatar: intent.user.avatar,
      gender: intent.user.gender,
      level: profile?.level ?? null,
      status: intent.status,
      inProposal: inProposalIds.has(intent.userId),
      inGame: busyUserIds.has(intent.userId),
      matchesGame: scored.matchesGame,
      fit: scored.fit,
      mismatch: scored.mismatch,
      gamesTogetherCount: together.get(intent.userId) ?? 0,
      matchScore: scored.score,
    });
  }

  const ranked = rankInvitePoolMembers(members);
  return {
    cityId: input.cityId,
    sport: input.sport,
    entityType: input.entityType,
    members: ranked,
    total: ranked.length,
  };
}

export class PlayIntentInvitePoolService {
  static async forGame(
    viewerId: string,
    gameId: string,
    isAdmin: boolean,
    browseCityId?: string,
  ): Promise<InvitePool> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        anyoneCanInvite: true,
        cityId: true,
        clubId: true,
        sport: true,
        entityType: true,
        startTime: true,
        minLevel: true,
        maxLevel: true,
        genderTeams: true,
        city: { select: { timezone: true } },
        participants: { select: { userId: true, status: true } },
      },
    });
    if (!game) throw new ApiError(404, 'errors.invites.gameNotFound');
    await assertCanInviteToGame(gameId, viewerId, isAdmin, game.anyoneCanInvite);
    if (!game.cityId) throw new ApiError(400, 'City is required');

    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { currentCityId: true },
    });
    if (!browseCityId && viewer?.currentCityId && game.cityId !== viewer.currentCityId) {
      throw new ApiError(400, 'Game is not in your city');
    }

    const poolCityId = browseCityId || game.cityId;
    if (browseCityId) {
      const browseCity = await prisma.city.findUnique({
        where: { id: browseCityId },
        select: { id: true, isActive: true },
      });
      if (!browseCity?.isActive) throw new ApiError(400, 'City is required');
    }

    const timezone = game.city?.timezone || 'UTC';
    const excludeUserIds = new Set(
      game.participants
        .filter((p) => BLOCKING_PARTICIPANT_STATUSES.has(p.status))
        .map((p) => p.userId),
    );

    return buildPool({
      viewerId,
      cityId: poolCityId,
      timezone,
      sport: game.sport,
      entityType: invitePoolIntentEntityType(game.entityType),
      dateKey: formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd'),
      clubId: game.clubId,
      startTime: game.startTime,
      startTimeMinutes: timeStringToMinutes(formatInTimeZone(game.startTime, timezone, 'HH:mm')),
      minLevel: game.minLevel,
      maxLevel: game.maxLevel,
      genderTeams: game.genderTeams,
      excludeUserIds,
    });
  }

  static async forDraft(viewerId: string, draft: InvitePoolDraft): Promise<InvitePool> {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { currentCityId: true },
    });
    const cityId = draft.cityId || viewer?.currentCityId;
    if (!cityId) throw new ApiError(400, 'City is required');

    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { timezone: true },
    });
    const timezone = draft.timeZone || city?.timezone || 'UTC';
    const startTime = new Date(draft.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new ApiError(400, 'Invalid start time');
    }

    return buildPool({
      viewerId,
      cityId,
      timezone,
      sport: draft.sport,
      entityType: invitePoolIntentEntityType(draft.entityType ?? EntityType.GAME),
      dateKey: formatInTimeZone(startTime, timezone, 'yyyy-MM-dd'),
      clubId: draft.clubId ?? null,
      startTime,
      startTimeMinutes: timeStringToMinutes(formatInTimeZone(startTime, timezone, 'HH:mm')),
      minLevel: draft.minLevel ?? null,
      maxLevel: draft.maxLevel ?? null,
      genderTeams: draft.genderTeams ?? null,
      excludeUserIds: new Set(),
    });
  }
}
