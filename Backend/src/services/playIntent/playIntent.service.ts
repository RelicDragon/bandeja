import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  MatchProposalStatus,
  PlayIntentStatus,
  PlayIntentTimeOfDay,
  Sport,
  GenderTeam,
  EntityType,
  Prisma,
  type Gender,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { endOfCalendarDate } from '../game/calendarDateBounds';
import { getSportConfig } from '../../sport/sportRegistry';
import { parseSport } from '../../sport/sportIds';
import {
  type IntentCriteria,
  resolveTimeWindow,
  timeStringToMinutes,
} from './playIntentCriteria';
import {
  intentWindowEndsAt,
  intentWindowIsReachable,
} from './playIntentFreshness';
import { PlayIntentFollowerNotificationQueueService } from './playIntentFollowerNotificationQueue.service';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { lockMatchProposal } from './matchProposalLock';
import { PlayIntentMatchQueueService } from './playIntentMatchQueue.service';
import {
  declineProposalMember,
  type ProposalMutation,
} from './matchProposalMemberLifecycle';
import { publishPlayIntentInvalidation } from './playIntentRealtime';

export type CreatePlayIntentDto = {
  cityId?: string;
  sport?: Sport | string;
  dayOffsets?: number[];
  dateKeys?: string[];
  timeOfDay?: PlayIntentTimeOfDay;
  startTime?: string | null;
  endTime?: string | null;
  clubIds?: string[];
  minLevel?: number | null;
  maxLevel?: number | null;
  genderTeams?: GenderTeam;
  entityType?: EntityType;
};

const MAX_DAY_OFFSET = 2;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function validateTime(value: string | null | undefined, label: string) {
  if (!value) return;
  if (!/^\d{2}:\d{2}$/.test(value) && value !== '24:00') {
    throw new ApiError(400, `${label} must be in HH:MM format`);
  }
  if (value === '24:00') return;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new ApiError(400, `${label} hours must be 0-23 and minutes must be 0-59`);
  }
}

function toIntentCriteria(row: {
  dateKeys: string[];
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  timeOfDay: PlayIntentTimeOfDay;
  startTime: string | null;
  endTime: string | null;
  genderTeams: GenderTeam;
  user?: { gender?: Gender | null; sportProfiles?: { sport: Sport; level: number }[] } | null;
  sport: Sport;
}): IntentCriteria {
  const profile = row.user?.sportProfiles?.find((p) => p.sport === row.sport);
  return {
    dateKeys: row.dateKeys,
    clubIds: row.clubIds,
    minLevel: row.minLevel,
    maxLevel: row.maxLevel,
    timeOfDay: row.timeOfDay,
    startTime: row.startTime,
    endTime: row.endTime,
    genderTeams: row.genderTeams,
    userLevel: profile?.level ?? null,
    userGender: row.user?.gender ?? null,
  };
}

export class PlayIntentService {
  static toCriteria = toIntentCriteria;

  static async getMyActiveIntent(userId: string, cityId?: string, sport?: Sport) {
    const where: {
      userId: string;
      status: { in: PlayIntentStatus[] };
      expiresAt: { gt: Date };
      cityId?: string;
      sport?: Sport;
    } = {
      userId,
      status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
      expiresAt: { gt: new Date() },
    };
    if (cityId) where.cityId = cityId;
    if (sport) where.sport = sport;

    const intents = await prisma.playIntent.findMany({
      where,
      include: {
        city: { select: { id: true, name: true, timezone: true, country: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return (
      intents.find((intent) =>
        intentWindowIsReachable(intent, intent.city.timezone, now),
      ) ?? null
    );
  }

  static async createOrReplace(
    userId: string,
    data: CreatePlayIntentDto,
    transactionGuard?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currentCityId: true,
        primarySport: true,
        gender: true,
        sportProfiles: { select: { sport: true, level: true } },
      },
    });
    if (!user) throw new ApiError(404, 'User not found');

    const cityId = data.cityId || user.currentCityId;
    if (!cityId) throw new ApiError(400, 'City is required');

    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true, timezone: true, name: true, country: true },
    });
    if (!city) throw new ApiError(404, 'City not found');

    const sport = parseSport(data.sport ?? user.primarySport);
    getSportConfig(sport);

    const entityType =
      data.entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME;

    const timeOfDay = data.timeOfDay ?? PlayIntentTimeOfDay.ANYTIME;
    const genderTeams = data.genderTeams ?? GenderTeam.ANY;
    if (!Object.values(GenderTeam).includes(genderTeams)) {
      throw new ApiError(400, 'Invalid genderTeams');
    }
    if (timeOfDay === PlayIntentTimeOfDay.CUSTOM) {
      validateTime(data.startTime, 'Start time');
      validateTime(data.endTime, 'End time');
      if (data.startTime && data.endTime) {
        if (timeStringToMinutes(data.startTime) >= timeStringToMinutes(data.endTime)) {
          throw new ApiError(400, 'End time must be after start time');
        }
      }
    }

    if (entityType !== EntityType.BAR && data.maxLevel != null && data.minLevel != null && data.maxLevel < data.minLevel) {
      throw new ApiError(400, 'Max level must be greater than or equal to min level');
    }

    const dateKeys = this.resolveDateKeys({
      timezone: city.timezone,
      dayOffsets: data.dayOffsets,
      dateKeys: data.dateKeys,
    });
    if (dateKeys.length === 0) {
      throw new ApiError(400, 'Select at least one day (today, tomorrow, or day after)');
    }

    const expiresAt =
      intentWindowEndsAt(
        {
          dateKeys,
          timeOfDay,
          startTime:
            timeOfDay === PlayIntentTimeOfDay.CUSTOM
              ? data.startTime ?? null
              : null,
          endTime:
            timeOfDay === PlayIntentTimeOfDay.CUSTOM
              ? data.endTime ?? null
              : null,
        },
        city.timezone,
      ) ?? endOfCalendarDate(dateKeys[dateKeys.length - 1], city.timezone);
    if (expiresAt <= new Date()) {
      throw new ApiError(400, 'Selected play window has already ended', true, {
        code: 'playIntent.windowEnded',
      });
    }

    const reservedInvite = await prisma.gameParticipant.findFirst({
      where: {
        userId,
        status: 'INVITED',
        playIntent: {
          cityId,
          status: PlayIntentStatus.MATCHED,
        },
      },
      select: { id: true },
    });
    if (reservedInvite) {
      throw new ApiError(409, 'Answer the pending game invite first', true, {
        code: 'playIntent.pendingGameInvite',
        inviteId: reservedInvite.id,
      });
    }

    const {
      intent,
      shouldNotifyFollowers,
      replacedLooking,
      proposalMutations,
    } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`play-intent:${userId}:${cityId}`}))`;
      if (expiresAt <= new Date()) {
        throw new ApiError(400, 'Selected play window has already ended', true, {
          code: 'playIntent.windowEnded',
        });
      }
      await transactionGuard?.(tx);
      const linkedInvite = await tx.gameParticipant.findFirst({
        where: {
          userId,
          status: 'INVITED',
          playIntent: {
            cityId,
            status: PlayIntentStatus.MATCHED,
          },
        },
        select: {
          id: true,
        },
      });
      if (linkedInvite) {
        throw new ApiError(409, 'Answer the pending game invite first', true, {
          code: 'playIntent.pendingGameInvite',
          inviteId: linkedInvite.id,
        });
      }
      const now = new Date();
      const existingActive = await tx.playIntent.findFirst({
        where: {
          userId,
          cityId,
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
          expiresAt: { gt: now },
        },
        include: {
          city: { select: { id: true, name: true, timezone: true, country: true } },
        },
      });
      const requestedStart =
        timeOfDay === PlayIntentTimeOfDay.CUSTOM ? data.startTime ?? null : null;
      const requestedEnd =
        timeOfDay === PlayIntentTimeOfDay.CUSTOM ? data.endTime ?? null : null;
      const requestedClubs = data.clubIds ?? [];
      const requestedMin =
        entityType === EntityType.BAR ? null : data.minLevel ?? null;
      const requestedMax =
        entityType === EntityType.BAR ? null : data.maxLevel ?? null;
      const requestedGender =
        entityType === EntityType.BAR ? GenderTeam.ANY : genderTeams;
      if (
        existingActive &&
        intentWindowIsReachable(existingActive, city.timezone, now) &&
        existingActive.sport === sport &&
        existingActive.entityType === entityType &&
        arraysEqual(existingActive.dateKeys, dateKeys) &&
        existingActive.timeOfDay === timeOfDay &&
        existingActive.startTime === requestedStart &&
        existingActive.endTime === requestedEnd &&
        arraysEqual(existingActive.clubIds, requestedClubs) &&
        existingActive.minLevel === requestedMin &&
        existingActive.maxLevel === requestedMax &&
        existingActive.genderTeams === requestedGender
      ) {
        return {
          intent: existingActive,
          shouldNotifyFollowers: false,
          replacedLooking: false,
          proposalMutations: [] as ProposalMutation[],
        };
      }
      const pendingMemberships = await tx.matchProposalMember.findMany({
        where: {
          userId,
          proposal: {
            cityId,
            status: {
              in: [
                MatchProposalStatus.PENDING,
                MatchProposalStatus.ACCEPTED,
              ],
            },
            gameId: null,
          },
        },
        select: { proposalId: true },
        orderBy: { proposalId: 'asc' },
      });
      const proposalMutations: ProposalMutation[] = [];
      for (const proposalId of [
        ...new Set(pendingMemberships.map((row) => row.proposalId)),
      ]) {
        const mutation = await declineProposalMember(
          tx,
          proposalId,
          userId,
          { allowUnavailable: true },
        );
        if (mutation) proposalMutations.push(mutation);
      }
      await tx.playIntent.updateMany({
        where: {
          userId,
          cityId,
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
          gameParticipants: { none: {} },
        },
        data: { status: PlayIntentStatus.CANCELLED },
      });
      const created = await tx.playIntent.create({
        data: {
          userId,
          cityId,
          sport,
          entityType,
          dateKeys,
          timeOfDay,
          startTime: requestedStart,
          endTime: requestedEnd,
          clubIds: requestedClubs,
          minLevel: requestedMin,
          maxLevel: requestedMax,
          genderTeams: requestedGender,
          status: PlayIntentStatus.OPEN,
          expiresAt,
        },
        include: {
          city: { select: { id: true, name: true, timezone: true, country: true } },
        },
      });
      const hadReachableActive =
        !!existingActive && intentWindowIsReachable(existingActive, city.timezone, now);
      const shouldNotify = entityType === EntityType.GAME && !hadReachableActive;
      if (shouldNotify) {
        await tx.playIntentFollowerNotificationJob.create({
          data: {
            intentId: created.id,
            userId,
            cityId,
            runAfter: new Date(Date.now() + 1_000),
          },
        });
      }
      await PlayIntentMatchQueueService.enqueueIntentCreated(tx, created.id);
      return {
        intent: created,
        shouldNotifyFollowers: shouldNotify,
        replacedLooking: true,
        proposalMutations,
      };
    });

    for (const mutation of proposalMutations) {
      publishPlayIntentInvalidation({
        reason: 'proposal-updated',
        proposalId: mutation.proposalId,
        cityId: mutation.cityId,
        sport: mutation.sport,
        entityType: mutation.entityType,
        userIds: mutation.userIds,
      });
    }
    if (replacedLooking) {
      publishPlayIntentInvalidation({
        reason: 'intent-created',
        intentId: intent.id,
        cityId: intent.cityId,
        sport: intent.sport,
        entityType: intent.entityType,
        userIds: [userId],
      });
    }

    void PlayIntentMatchQueueService.drain();
    if (shouldNotifyFollowers) {
      void PlayIntentFollowerNotificationQueueService.drain();
    }

    return intent;
  }

  static async cancel(userId: string, intentId?: string) {
    const where = intentId
      ? {
          id: intentId,
          userId,
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        }
      : {
          userId,
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        };

    const intents = await prisma.playIntent.findMany({
      where,
      select: {
        id: true,
        cityId: true,
        sport: true,
        entityType: true,
      },
    });
    if (intents.length === 0) {
      throw new ApiError(404, 'No open play intent found');
    }
    const reservedInvite = await prisma.gameParticipant.findFirst({
      where: {
        status: 'INVITED',
        playIntentId: { in: intents.map((intent) => intent.id) },
      },
      select: { id: true },
    });
    if (reservedInvite) {
      throw new ApiError(409, 'Answer the pending game invite first', true, {
        code: 'playIntent.pendingGameInvite',
        inviteId: reservedInvite.id,
      });
    }

    const { updated, proposalMutations } = await prisma.$transaction(async (tx) => {
      for (const cityId of [
        ...new Set(intents.map((intent) => intent.cityId)),
      ].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`play-intent:${userId}:${cityId}`}))`;
      }
      const memberships = await tx.matchProposalMember.findMany({
        where: {
          userId,
          intentId: { in: intents.map((intent) => intent.id) },
          proposal: {
            status: {
              in: [
                MatchProposalStatus.PENDING,
                MatchProposalStatus.ACCEPTED,
              ],
            },
            gameId: null,
          },
        },
        select: { proposalId: true },
        orderBy: { proposalId: 'asc' },
      });
      const proposalMutations: ProposalMutation[] = [];
      for (const proposalId of [
        ...new Set(memberships.map((row) => row.proposalId)),
      ]) {
        const mutation = await declineProposalMember(
          tx,
          proposalId,
          userId,
          { allowUnavailable: true },
        );
        if (mutation) proposalMutations.push(mutation);
      }
      const updated = await tx.playIntent.updateMany({
        where: {
          id: { in: intents.map((intent) => intent.id) },
          gameParticipants: { none: {} },
        },
        data: { status: PlayIntentStatus.CANCELLED },
      });
      const linkedInvite = await tx.gameParticipant.findFirst({
        where: {
          status: 'INVITED',
          playIntentId: { in: intents.map((intent) => intent.id) },
        },
        select: { id: true },
      });
      if (linkedInvite) {
        throw new ApiError(409, 'Answer the pending game invite first', true, {
          code: 'playIntent.pendingGameInvite',
          inviteId: linkedInvite.id,
        });
      }
      return { updated, proposalMutations };
    });

    for (const mutation of proposalMutations) {
      publishPlayIntentInvalidation({
        reason: 'proposal-updated',
        proposalId: mutation.proposalId,
        cityId: mutation.cityId,
        sport: mutation.sport,
        entityType: mutation.entityType,
        userIds: mutation.userIds,
      });
    }
    if (updated.count > 0) {
      for (const intent of intents) {
        publishPlayIntentInvalidation({
          reason: 'intent-cancelled',
          intentId: intent.id,
          cityId: intent.cityId,
          sport: intent.sport,
          entityType: intent.entityType,
          userIds: [userId],
        });
      }
    }

    return { cancelled: updated.count };
  }

  static allowedDateKeys(timezone: string, now = new Date()): string[] {
    const todayKey = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
    const [y, m, d] = todayKey.split('-').map(Number);
    const keys: string[] = [];
    for (let i = 0; i <= MAX_DAY_OFFSET; i++) {
      const next = new Date(Date.UTC(y, m - 1, d + i));
      keys.push(
        `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`,
      );
    }
    return keys;
  }

  static resolveDateKeys(input: {
    timezone: string;
    dayOffsets?: number[];
    dateKeys?: string[];
  }): string[] {
    const allowed = this.allowedDateKeys(input.timezone);
    const allowedSet = new Set(allowed);

    if (input.dateKeys && input.dateKeys.length > 0) {
      return [...new Set(input.dateKeys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && allowedSet.has(k)))].sort();
    }

    const offsets = input.dayOffsets?.length ? input.dayOffsets : [0];
    const unique = [...new Set(offsets.filter((o) => o >= 0 && o <= MAX_DAY_OFFSET))];
    return unique.map((offset) => allowed[offset]).filter(Boolean).sort();
  }

  static async expireDueIntents(): Promise<number> {
    const now = new Date();
    let expired = 0;
    while (true) {
      const due = await prisma.playIntent.findMany({
        where: {
          status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
          expiresAt: { lte: now },
          gameParticipants: { none: {} },
        },
        select: {
          id: true,
          userId: true,
          cityId: true,
          sport: true,
          entityType: true,
        },
        orderBy: { expiresAt: 'asc' },
        take: 500,
      });
      if (due.length === 0) return expired;

      const intentIds = due.map((intent) => intent.id);
      const linkedProposals = await prisma.matchProposal.findMany({
        where: {
          status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
          gameId: null,
          members: { some: { intentId: { in: intentIds } } },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      const batchResult = await prisma.$transaction(async (tx) => {
        const proposalIntentIds = new Set<string>();
        const dueIntentIds = new Set(intentIds);
        const proposalMutations: ProposalMutation[] = [];
        let releasedExpired = 0;
        for (const proposal of linkedProposals) {
          await lockMatchProposal(tx, proposal.id);
          const current = await tx.matchProposal.findFirst({
            where: {
              id: proposal.id,
              status: {
                in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
              },
              gameId: null,
            },
            include: {
              members: {
                select: { intentId: true, userId: true },
              },
            },
          });
          if (!current) continue;
          await tx.matchProposal.update({
            where: { id: current.id },
            data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
          });
          current.members.forEach((member) =>
            proposalIntentIds.add(member.intentId),
          );
          proposalMutations.push({
            proposalId: current.id,
            cityId: current.cityId,
            sport: current.sport,
            entityType: current.entityType,
            userIds: current.members.map((member) => member.userId),
          });
        }
        for (const intentId of [...proposalIntentIds].sort()) {
          const status = await PlayIntentGameLifecycleService.release(
            tx,
            intentId,
            now,
          );
          if (dueIntentIds.has(intentId) && status === PlayIntentStatus.EXPIRED) {
            releasedExpired += 1;
          }
        }
        const updated = await tx.playIntent.updateMany({
          where: {
            id: { in: intentIds },
            status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
            gameParticipants: { none: {} },
          },
          data: { status: PlayIntentStatus.EXPIRED },
        });
        return {
          expiredCount: releasedExpired + updated.count,
          proposalMutations,
        };
      });
      expired += batchResult.expiredCount;
      for (const mutation of batchResult.proposalMutations) {
        publishPlayIntentInvalidation({
          reason: 'proposal-expired',
          proposalId: mutation.proposalId,
          cityId: mutation.cityId,
          sport: mutation.sport,
          entityType: mutation.entityType,
          userIds: mutation.userIds,
        });
      }
      for (const intent of due) {
        publishPlayIntentInvalidation({
          reason: 'intent-expired',
          intentId: intent.id,
          cityId: intent.cityId,
          sport: intent.sport,
          entityType: intent.entityType,
          userIds: [intent.userId],
        });
      }
    }
  }

  static summarizeWindow(intent: {
    timeOfDay: PlayIntentTimeOfDay;
    startTime: string | null;
    endTime: string | null;
  }) {
    return resolveTimeWindow(intent);
  }
}
