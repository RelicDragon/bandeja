import prisma from '../../config/database';
import {
  EntityType,
  MatchProposalStatus,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  Sport,
  type Prisma,
  type GenderTeam,
  type PlayIntentTimeOfDay,
  type Gender,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { getSportConfig } from '../../sport/sportRegistry';
import { NotificationType } from '../../types/notifications.types';
import { startOfCalendarDate, endOfCalendarDate } from '../game/calendarDateBounds';
import {
  affinityScore,
  buildRematchKey,
  canIntentJoinProposal,
  intentMatchesGame,
  intentsCompatible,
  minutesToTimeString,
  resolveTimeWindow,
  timeStringToMinutes,
  type IntentCriteria,
  type TimeWindow,
} from './playIntentCriteria';
import { PlayIntentService } from './playIntent.service';
import { MatchProposalService } from './matchProposal.service';
import { PlayIntentNotifyService } from './playIntentNotify.service';
import {
  futureGameDateBounds,
  intentWindowIsReachable,
  proposalWindowSource,
} from './playIntentFreshness';
import { derivePlayIntentPoolAvailability } from './playIntentPoolAvailability';
import { rankPlayIntentPoolMembers } from './playIntentPoolRanking';

const REMATCH_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const PROPOSAL_TTL_MS = 2 * 60 * 60 * 1000;
const LOBBY_CAP = 48;

type IntentRow = {
  id: string;
  userId: string;
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  dateKeys: string[];
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  timeOfDay: PlayIntentTimeOfDay;
  startTime: string | null;
  endTime: string | null;
  genderTeams: GenderTeam;
  status: PlayIntentStatus;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    gender: Gender | null;
    sportProfiles: { sport: Sport; level: number }[];
  };
};

const intentUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  gender: true,
  sportProfiles: { select: { sport: true, level: true } },
} as const;

export class PlayIntentMatchService {
  static async onIntentCreated(intentId: string) {
    const intent = await prisma.playIntent.findUnique({
      where: { id: intentId },
      include: {
        user: { select: intentUserSelect },
        city: { select: { timezone: true } },
      },
    });
    if (!intent) return;
    if (intent.status === PlayIntentStatus.MATCHED) {
      const existingProposal = await prisma.matchProposal.findFirst({
        where: {
          status: {
            in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
          },
          expiresAt: { gt: new Date() },
          gameId: null,
          members: { some: { intentId: intent.id } },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existingProposal) {
        await PlayIntentNotifyService.notifyPlayIntentMatch(existingProposal.id);
      }
      return;
    }
    if (intent.status !== PlayIntentStatus.OPEN) return;

    await this.matchIntentToGames(intent as IntentRow & { city: { timezone: string } });
    await this.clusterCitySport(intent.cityId, intent.sport, intent.entityType);
  }

  static async onPublicGameCreated(gameId: string, creatorId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { status: ParticipantStatus.PLAYING },
          select: { id: true },
        },
        city: { select: { timezone: true } },
      },
    });
    if (!game) return;
    if (!game.isPublic || !game.clubId) return;
    if (game.entityType === EntityType.LEAGUE || game.entityType === EntityType.LEAGUE_SEASON) return;
    if (game.entityType !== EntityType.BAR && game.entityType !== EntityType.GAME && game.entityType !== EntityType.TRAINING && game.entityType !== EntityType.TOURNAMENT) {
      return;
    }

    const intentEntityType =
      game.entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME;

    const now = new Date();
    if (game.startTime.getTime() <= now.getTime()) return;

    const timezone = game.city?.timezone || 'UTC';
    const openSlots = Math.max(0, (game.maxParticipants || 0) - game.participants.length);
    if (openSlots <= 0) return;

    const dateKey = formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd');
    const startMinutes = timeStringToMinutes(formatInTimeZone(game.startTime, timezone, 'HH:mm'));

    const intents = await prisma.playIntent.findMany({
      where: {
        cityId: game.cityId,
        sport: game.sport,
        entityType: intentEntityType,
        status: PlayIntentStatus.OPEN,
        expiresAt: { gt: now },
        userId: { not: creatorId },
      },
      include: {
        user: {
          select: {
            id: true,
            gender: true,
            sportProfiles: { select: { sport: true, level: true } },
          },
        },
      },
    });

    const matchingUserIds: string[] = [];
    const busyUserIds = await this.usersBusyPlaying(
      intents.map((i) => i.userId),
      [dateKey],
      game.cityId,
    );

    for (const intent of intents) {
      if (busyUserIds.has(intent.userId)) continue;
      if (!intentWindowIsReachable(intent, timezone, now)) continue;
      const criteria = PlayIntentService.toCriteria({ ...intent, sport: intent.sport });
      if (
        intentMatchesGame(
          criteria,
          {
            entityType: game.entityType,
            dateKey,
            clubId: game.clubId,
            startTime: game.startTime,
            startTimeMinutes: startMinutes,
            minLevel: game.minLevel,
            maxLevel: game.maxLevel,
            genderTeams: game.genderTeams,
          },
          now,
        )
      ) {
        matchingUserIds.push(intent.userId);
      }
    }

    if (matchingUserIds.length > 0) {
      const notified = await PlayIntentNotifyService.notifyGameMatchesIntent(
        matchingUserIds,
        game.id,
      );
      await PlayIntentNotifyService.maybeNotifyOwnerLookingPlayers(
        game.id,
        creatorId,
        notified,
      );
    }
  }

  /** Public game gained an open slot (e.g. player left) — re-match open intents. */
  static async onPublicGameSlotsOpened(gameId: string) {
    const owner = await prisma.gameParticipant.findFirst({
      where: { gameId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      select: { userId: true },
    });
    await this.onPublicGameCreated(gameId, owner?.userId ?? '');
  }

  static async matchIntentToGames(intent: IntentRow & { city?: { timezone: string } | null }) {
    if (!intent.cityId) return;
    const city =
      intent.city ||
      (await prisma.city.findUnique({
        where: { id: intent.cityId },
        select: { timezone: true },
      }));
    if (!city) return;

    const now = new Date();
    if (!intentWindowIsReachable(intent, city.timezone, now)) return;

    const busy = await this.usersBusyPlaying([intent.userId], intent.dateKeys, intent.cityId);
    if (busy.has(intent.userId)) return;

    const dateBounds = futureGameDateBounds(
      intent.dateKeys,
      city.timezone,
      now,
    );
    if (dateBounds.length === 0) return;

    const games = await prisma.game.findMany({
      where: {
        cityId: intent.cityId,
        sport: intent.sport,
        isPublic: true,
        clubId: { not: null },
        entityType:
          intent.entityType === EntityType.BAR
            ? EntityType.BAR
            : { in: [EntityType.GAME, EntityType.TRAINING, EntityType.TOURNAMENT] },
        OR: dateBounds.map((b) => ({ startTime: b })),
        status: { in: ['ANNOUNCED', 'STARTED'] },
        participants: {
          none: { userId: intent.userId, role: ParticipantRole.OWNER },
        },
      },
      include: {
        participants: {
          where: { status: ParticipantStatus.PLAYING },
          select: { id: true, userId: true, role: true },
        },
      },
      take: 40,
      orderBy: { startTime: 'asc' },
    });

    const criteria = PlayIntentService.toCriteria(intent);
    const matched: typeof games = [];

    for (const game of games) {
      const openSlots = Math.max(0, (game.maxParticipants || 0) - game.participants.length);
      if (openSlots <= 0) continue;
      const owner = game.participants.find((p) => p.role === ParticipantRole.OWNER);
      if (owner?.userId === intent.userId) continue;
      const dateKey = formatInTimeZone(game.startTime, city.timezone, 'yyyy-MM-dd');
      const startMinutes = timeStringToMinutes(formatInTimeZone(game.startTime, city.timezone, 'HH:mm'));
      if (
        intentMatchesGame(
          criteria,
          {
            entityType: game.entityType,
            dateKey,
            clubId: game.clubId,
            startTime: game.startTime,
            startTimeMinutes: startMinutes,
            minLevel: game.minLevel,
            maxLevel: game.maxLevel,
            genderTeams: game.genderTeams,
          },
          now,
        )
      ) {
        matched.push(game);
      }
    }

    if (matched.length > 0) {
      const notified = await PlayIntentNotifyService.notifyGameMatchesIntent(
        [intent.userId],
        matched[0].id,
      );
      if (notified > 0) {
        for (const game of matched.slice(0, 3)) {
          const owner = game.participants.find((p) => p.role === ParticipantRole.OWNER);
          if (owner?.userId) {
            await PlayIntentNotifyService.maybeNotifyOwnerLookingPlayers(
              game.id,
              owner.userId,
              1,
            );
          }
        }
      }
    }
  }

  static async clusterCitySport(
    cityId: string,
    sport: Sport,
    entityType: EntityType = EntityType.GAME,
  ): Promise<string | null> {
    const partySize =
      entityType === EntityType.BAR ? 2 : getSportConfig(sport).defaultPlayersPerMatch;
    const now = new Date();

    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { timezone: true },
    });
    if (!city) return null;

    const allIntents = (await prisma.playIntent.findMany({
      where: {
        cityId,
        sport,
        entityType,
        status: PlayIntentStatus.OPEN,
        expiresAt: { gt: now },
      },
      include: { user: { select: intentUserSelect } },
      orderBy: { createdAt: 'asc' },
    })) as IntentRow[];

    const intents = allIntents.filter((intent) =>
      intentWindowIsReachable(intent, city.timezone, now),
    );

    if (intents.length < partySize) return null;

    const busyUserIds = await this.usersBusyPlaying(
      intents.map((i) => i.userId),
      intents.flatMap((i) => i.dateKeys),
      cityId,
    );

    const blockedRows = await prisma.blockedUser.findMany({
      where: {
        OR: [
          { userId: { in: intents.map((i) => i.userId) } },
          { blockedUserId: { in: intents.map((i) => i.userId) } },
        ],
      },
      select: { userId: true, blockedUserId: true },
    });
    const blockedPairs = new Set(
      blockedRows.map((b) => [b.userId, b.blockedUserId].sort().join('|')),
    );
    const isPairBlocked = (a: string, b: string) => blockedPairs.has([a, b].sort().join('|'));

    const available = intents.filter((i) => !busyUserIds.has(i.userId));
    if (available.length < partySize) return null;

    const criteriaMap = new Map<string, IntentCriteria>();
    for (const intent of available) {
      criteriaMap.set(intent.id, PlayIntentService.toCriteria(intent));
    }

    const used = new Set<string>();

    for (const seed of available) {
      if (used.has(seed.id)) continue;
      const seedCrit = criteriaMap.get(seed.id)!;
      const candidates: {
        intent: IntentRow;
        tightness: number;
        dateKeys: string[];
        clubIds: string[];
        timeWindow: TimeWindow | null;
      }[] = [];

      for (const other of available) {
        if (other.id === seed.id || used.has(other.id)) continue;
        if (isPairBlocked(seed.userId, other.userId)) continue;
        const compat = intentsCompatible(seedCrit, criteriaMap.get(other.id)!);
        if (compat.ok) {
          candidates.push({
            intent: other,
            tightness: compat.tightness,
            dateKeys: compat.dateKeys,
            clubIds: compat.clubIds,
            timeWindow: compat.timeWindow,
          });
        }
      }

      candidates.sort((a, b) => b.tightness - a.tightness);
      const group = [seed];
      let groupDates = [...seed.dateKeys];
      let groupClubs = [...seed.clubIds];
      let groupWindow = resolveTimeWindow(seedCrit);

      for (const cand of candidates) {
        if (group.length >= partySize) break;
        if (group.some((g) => isPairBlocked(g.userId, cand.intent.userId))) continue;
        const allOk = group.every((g) => intentsCompatible(criteriaMap.get(g.id)!, criteriaMap.get(cand.intent.id)!).ok);
        if (!allOk) continue;
        group.push(cand.intent);
        groupDates = cand.dateKeys.filter((d) => groupDates.includes(d));
        if (groupClubs.length === 0) groupClubs = cand.clubIds;
        else if (cand.clubIds.length > 0) {
          groupClubs = groupClubs.filter((c) => cand.clubIds.includes(c));
        }
        if (cand.timeWindow) groupWindow = cand.timeWindow;
      }

      if (group.length < partySize) continue;

      const memberIds = group.map((g) => g.userId);
      const rematchKey = buildRematchKey(memberIds);
      const recent = await prisma.matchProposal.findFirst({
        where: {
          rematchKey,
          createdAt: { gte: new Date(now.getTime() - REMATCH_COOLDOWN_MS) },
        },
        select: { id: true },
      });
      if (recent) {
        for (const g of group) used.add(g.id);
        continue;
      }

      const proposal = await MatchProposalService.createFromCluster({
        cityId,
        sport,
        entityType,
        members: group.map((g) => ({ userId: g.userId, intentId: g.id })),
        dateKeys: groupDates.length ? groupDates : group[0].dateKeys,
        clubIds: groupClubs,
        startTime: groupWindow ? minutesToTimeString(groupWindow.startMinutes) : null,
        endTime: groupWindow ? minutesToTimeString(groupWindow.endMinutes) : null,
        rematchKey,
        expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
      });
      if (!proposal) {
        // Lost race — another worker claimed some intents.
        continue;
      }

      for (const g of group) used.add(g.id);
      await PlayIntentNotifyService.notifyPlayIntentMatch(proposal.id);
      return proposal.id;
    }

    return null;
  }

  static async usersBusyPlaying(userIds: string[], dateKeys: string[], cityId: string): Promise<Set<string>> {
    if (userIds.length === 0 || dateKeys.length === 0) return new Set();
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { timezone: true } });
    if (!city) return new Set();

    const uniqueDates = [...new Set(dateKeys)];
    const orDates = uniqueDates.flatMap((key) => {
      try {
        return [{ startTime: { gte: startOfCalendarDate(key, city.timezone), lte: endOfCalendarDate(key, city.timezone) } }];
      } catch {
        return [];
      }
    });
    if (orDates.length === 0) return new Set();

    const playing = await prisma.gameParticipant.findMany({
      where: {
        userId: { in: userIds },
        OR: [
          { status: ParticipantStatus.PLAYING },
          {
            status: ParticipantStatus.INVITED,
            playIntentId: { not: null },
          },
        ],
        game: {
          cityId,
          OR: orDates,
          status: { in: ['ANNOUNCED', 'STARTED'] },
        },
      },
      select: { userId: true },
    });

    return new Set(playing.map((p) => p.userId));
  }

  static async getPoolForViewer(userId: string, cityId: string, sportHint: Sport) {
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { timezone: true },
    });
    const timezone = city?.timezone || 'UTC';
    const todayKey = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
    const now = new Date();

    // City-scoped: compose may create a different sport/BAR than the strip's hint.
    const foundViewerIntent = await prisma.playIntent.findFirst({
      where: {
        userId,
        cityId,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            gender: true,
            sportProfiles: { select: { sport: true, level: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const foundPendingProposal = await prisma.matchProposal.findFirst({
      where: {
        cityId,
        status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
        expiresAt: { gt: now },
        gameId: null,
        members: { some: { userId } },
      },
      select: {
        id: true,
        status: true,
        hostUserId: true,
        sport: true,
        entityType: true,
        dateKeys: true,
        startTime: true,
        endTime: true,
        clubIds: true,
        suggestedStartTime: true,
        expiresAt: true,
        members: {
          select: {
            userId: true,
            intentId: true,
            isHost: true,
            response: true,
            intent: {
              include: {
                user: { select: intentUserSelect },
              },
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                sportProfiles: { select: { sport: true, level: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const viewerIntent =
      foundViewerIntent &&
      intentWindowIsReachable(foundViewerIntent, timezone, now)
        ? foundViewerIntent
        : null;
    const pendingProposal =
      foundPendingProposal &&
      intentWindowIsReachable(
        proposalWindowSource(foundPendingProposal),
        timezone,
        now,
      )
        ? foundPendingProposal
        : null;

    const sport = viewerIntent?.sport ?? pendingProposal?.sport ?? sportHint;
    const entityType =
      viewerIntent?.entityType ?? pendingProposal?.entityType ?? EntityType.GAME;

    const compatibilityWhere: Prisma.PlayIntentWhereInput = viewerIntent
      ? {
          dateKeys: { hasSome: viewerIntent.dateKeys },
          ...(viewerIntent.clubIds.length > 0
            ? {
                OR: [
                  { clubIds: { isEmpty: true } },
                  { clubIds: { hasSome: viewerIntent.clubIds } },
                ],
              }
            : {}),
        }
      : {};
    const foundIntents = await prisma.playIntent.findMany({
      where: {
        cityId,
        sport,
        entityType,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
        userId: { not: userId },
        gameParticipants: { none: {} },
        ...compatibilityWhere,
      },
      include: { user: { select: intentUserSelect } },
      orderBy: { createdAt: 'asc' },
    });
    const intents = foundIntents.filter((intent) =>
      intentWindowIsReachable(intent, timezone, now),
    );

    const blocked = await prisma.blockedUser.findMany({
      where: { OR: [{ userId }, { blockedUserId: userId }] },
      select: { userId: true, blockedUserId: true },
    });
    const blockedIds = new Set<string>();
    for (const b of blocked) {
      if (b.userId === userId) blockedIds.add(b.blockedUserId);
      if (b.blockedUserId === userId) blockedIds.add(b.userId);
    }

    const viewerCriteria =
      viewerIntent &&
      (viewerIntent.status === PlayIntentStatus.OPEN ||
        viewerIntent.status === PlayIntentStatus.MATCHED)
        ? PlayIntentService.toCriteria({ ...viewerIntent, sport })
        : null;
    const partySize =
      entityType === EntityType.BAR
        ? 2
        : getSportConfig(sport).defaultPlayersPerMatch;

    const proposalMemberIds = new Set(
      (pendingProposal?.members ?? []).map((m) => m.userId),
    );
    const busyUserIds = await this.usersBusyPlaying(
      intents.map((intent) => intent.userId),
      viewerIntent?.dateKeys ?? pendingProposal?.dateKeys ?? [],
      cityId,
    );

    const members: {
      userId: string;
      intentId: string;
      firstName: string | null;
      lastName: string | null;
      avatar: string | null;
      level: number | null;
      affinity: 'near' | 'mid' | 'far';
      affinityScore: number;
      status: PlayIntentStatus;
      busyInGame: boolean;
      inProposal: boolean;
      eligibleForProposal: boolean;
    }[] = [];

    const proposalMemberCriteria =
      pendingProposal?.members.map((member) =>
        PlayIntentService.toCriteria(member.intent),
      ) ?? [];
    const proposalCanAcceptMembers =
      pendingProposal?.status === MatchProposalStatus.PENDING &&
      !pendingProposal.hostUserId &&
      pendingProposal.members.length < partySize;

    for (const intent of intents) {
      if (blockedIds.has(intent.userId)) continue;
      const otherCrit = PlayIntentService.toCriteria(intent);
      if (!viewerCriteria) continue;
      const aff = affinityScore(viewerCriteria, otherCrit);
      const profile = intent.user.sportProfiles.find((p) => p.sport === sport);
      const inProposal = proposalMemberIds.has(intent.userId);
      const busyInGame = busyUserIds.has(intent.userId);
      members.push({
        userId: intent.user.id,
        intentId: intent.id,
        firstName: intent.user.firstName,
        lastName: intent.user.lastName,
        avatar: intent.user.avatar,
        level: profile?.level ?? null,
        affinity: aff.bucket,
        affinityScore: aff.score,
        status: intent.status,
        busyInGame,
        inProposal,
        eligibleForProposal:
          !!proposalCanAcceptMembers &&
          !inProposal &&
          !busyInGame &&
          (intent.status === PlayIntentStatus.OPEN ||
            intent.status === PlayIntentStatus.MATCHED) &&
          canIntentJoinProposal(otherCrit, proposalMemberCriteria),
      });
    }

    const ranked = rankPlayIntentPoolMembers(members, LOBBY_CAP);

    const { availableCount, clusterProgress } =
      derivePlayIntentPoolAvailability({
        members,
        partySize,
        viewerIsAvailable:
          viewerIntent?.status === PlayIntentStatus.OPEN ||
          viewerIntent?.status === PlayIntentStatus.MATCHED,
        proposalMemberCount: pendingProposal?.members.length ?? null,
      });

    return {
      todayKey,
      cityTimezone: timezone,
      myIntent: viewerIntent
        ? {
            id: viewerIntent.id,
            cityId: viewerIntent.cityId,
            sport: viewerIntent.sport,
            entityType: viewerIntent.entityType,
            dateKeys: viewerIntent.dateKeys,
            timeOfDay: viewerIntent.timeOfDay,
            startTime: viewerIntent.startTime,
            endTime: viewerIntent.endTime,
            clubIds: viewerIntent.clubIds,
            minLevel: viewerIntent.minLevel,
            maxLevel: viewerIntent.maxLevel,
            genderTeams: viewerIntent.genderTeams,
            status: viewerIntent.status,
            expiresAt: viewerIntent.expiresAt,
          }
        : null,
      partySize,
      availableCount,
      clusterProgress,
      members: ranked.members,
      total: ranked.total,
      overflow: ranked.overflow,
      pendingProposal: pendingProposal
        ? {
            id: pendingProposal.id,
            status: pendingProposal.status,
            hostUserId: pendingProposal.hostUserId,
            dateKeys: pendingProposal.dateKeys,
            startTime: pendingProposal.startTime,
            endTime: pendingProposal.endTime,
            clubIds: pendingProposal.clubIds,
            suggestedStartTime: pendingProposal.suggestedStartTime,
            expiresAt: pendingProposal.expiresAt,
            members: pendingProposal.members.map((m) => ({
              userId: m.userId,
              intentId: m.intentId,
              isHost: m.isHost,
              response: m.response,
              firstName: m.user.firstName,
              lastName: m.user.lastName,
              avatar: m.user.avatar,
              level: m.user.sportProfiles.find((p) => p.sport === sport)?.level ?? null,
            })),
          }
        : null,
    };
  }

  static async runClusterPass(): Promise<number> {
    const { PlayIntentMatchQueueService } = await import(
      './playIntentMatchQueue.service'
    );
    const replayed = await PlayIntentMatchQueueService.requeueFailedJobs();
    if (replayed > 0) {
      await PlayIntentMatchQueueService.drain();
    }

    let cursor: string | undefined;
    while (true) {
      const activeProposals = await prisma.matchProposal.findMany({
        where: {
          status: {
            in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
          },
          expiresAt: { gt: new Date() },
          gameId: null,
        },
        select: {
          id: true,
          _count: { select: { members: true } },
        },
        take: 50,
        orderBy: { createdAt: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (activeProposals.length === 0) break;

      const existingDeliveries =
        await prisma.playIntentNotificationDelivery.findMany({
          where: {
            notificationType: NotificationType.PLAY_INTENT_MATCH,
            sourceId: { in: activeProposals.map((proposal) => proposal.id) },
          },
          select: { sourceId: true, userId: true },
          distinct: ['sourceId', 'userId'],
        });
      const deliveredRecipients = new Map<string, number>();
      for (const delivery of existingDeliveries) {
        deliveredRecipients.set(
          delivery.sourceId,
          (deliveredRecipients.get(delivery.sourceId) ?? 0) + 1,
        );
      }
      for (const proposal of activeProposals) {
        if (
          (deliveredRecipients.get(proposal.id) ?? 0) <
          proposal._count.members
        ) {
          await PlayIntentNotifyService.notifyPlayIntentMatch(proposal.id);
        }
      }

      cursor = activeProposals.at(-1)?.id;
      if (activeProposals.length < 50 || !cursor) break;
    }

    const open = await prisma.playIntent.findMany({
      where: { status: PlayIntentStatus.OPEN, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        cityId: true,
        sport: true,
        entityType: true,
        userId: true,
        dateKeys: true,
        clubIds: true,
        minLevel: true,
        maxLevel: true,
        timeOfDay: true,
        startTime: true,
        endTime: true,
        genderTeams: true,
        status: true,
        expiresAt: true,
        city: { select: { timezone: true } },
        user: { select: intentUserSelect },
      },
    });
    let created = 0;
    const clustered = new Set<string>();
    for (const row of open) {
      await this.matchIntentToGames(row as IntentRow & { city: { timezone: string } });
      const key = `${row.cityId}:${row.sport}:${row.entityType}`;
      if (clustered.has(key)) continue;
      clustered.add(key);
      const id = await this.clusterCitySport(row.cityId, row.sport, row.entityType);
      if (id) created += 1;
    }
    return created;
  }
}
