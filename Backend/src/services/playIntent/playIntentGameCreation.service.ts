import {
  EntityType,
  MatchProposalMemberResponse,
  MatchProposalStatus,
  ParticipantRole,
  ParticipantStatus,
  type Prisma,
  type Sport,
  type Gender,
  type GenderTeam,
  type PlayIntentTimeOfDay,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { ApiError } from '../../utils/ApiError';
import { gameMismatch, intentMatchesGame, timeStringToMinutes } from './playIntentCriteria';
import { PlayIntentService } from './playIntent.service';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { lockMatchProposal } from './matchProposalLock';
import type { PlayIntentCreateSource } from '@bandeja/shared/playIntentCreateSource';

type TransactionClient = Prisma.TransactionClient;

type CreationContext = {
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  startTime: Date;
  clubId: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: string | null;
  maxParticipants: number;
};

type PreparedIntent = {
  id: string;
  userId: string;
  expiresAt: Date;
  dateKeys: string[];
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  timeOfDay: PlayIntentTimeOfDay;
  startTime: string | null;
  endTime: string | null;
  genderTeams: GenderTeam;
  sport: Sport;
  cityId: string;
  entityType: EntityType;
  user: {
    gender: Gender;
    sportProfiles: Array<{ sport: Sport; level: number }>;
  };
};

type PreparedSource = {
  source: PlayIntentCreateSource;
  host: PreparedIntent;
  invitees: PreparedIntent[];
  proposalId: string | null;
  releasedIntentIds: string[];
};

const intentInclude = {
  user: {
    select: {
      gender: true,
      sportProfiles: { select: { sport: true, level: true } },
    },
  },
} satisfies Prisma.PlayIntentInclude;

function parseSource(value: unknown): PlayIntentCreateSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (
    source.type === 'PROPOSAL' &&
    typeof source.proposalId === 'string' &&
    Array.isArray(source.inviteeIds) &&
    source.inviteeIds.every((id) => typeof id === 'string')
  ) {
    return {
      type: 'PROPOSAL',
      proposalId: source.proposalId,
      inviteeIds: source.inviteeIds as string[],
    };
  }
  if (
    source.type === 'DIRECT' &&
    typeof source.hostIntentId === 'string' &&
    Array.isArray(source.invitees)
  ) {
    const invitees = source.invitees.map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof (entry as Record<string, unknown>).userId !== 'string' ||
        typeof (entry as Record<string, unknown>).intentId !== 'string'
      ) {
        throw new ApiError(400, 'Invalid play intent create source');
      }
      return {
        userId: (entry as { userId: string }).userId,
        intentId: (entry as { intentId: string }).intentId,
      };
    });
    return { type: 'DIRECT', hostIntentId: source.hostIntentId, invitees };
  }
  throw new ApiError(400, 'Invalid play intent create source');
}

export class PlayIntentGameCreationService {
  static parseSource = parseSource;

  static async prepare(
    tx: TransactionClient,
    rawSource: unknown,
    creatorId: string,
    context: CreationContext,
    now: Date,
  ): Promise<PreparedSource | null> {
    const source = parseSource(rawSource);
    if (!source) return null;

    let host: PreparedIntent | null = null;
    let invitees: PreparedIntent[] = [];
    let proposalId: string | null = null;
    let sourceProposalIntentIds: Set<string> | null = null;
    const excludedProposalMembers: Array<{ id: string; intentId: string }> = [];

    if (source.type === 'PROPOSAL') {
      const proposal = await tx.matchProposal.findFirst({
        where: {
          id: source.proposalId,
          status: MatchProposalStatus.ACCEPTED,
          hostUserId: creatorId,
          gameId: null,
          expiresAt: { gt: now },
        },
        include: {
          members: {
            include: { intent: { include: intentInclude } },
          },
        },
      });
      if (!proposal) {
        throw new ApiError(409, 'Match proposal is no longer available', true, {
          code: 'playIntent.proposalUnavailable',
        });
      }
      const hostMember = proposal.members.find((member) => member.userId === creatorId);
      if (!hostMember) throw new ApiError(403, 'Proposal host is not a member');
      const inviteeIds = new Set(source.inviteeIds);
      if (inviteeIds.size !== source.inviteeIds.length || inviteeIds.has(creatorId)) {
        throw new ApiError(400, 'Invalid proposal invitee selection');
      }
      const proposalInvitees = proposal.members.filter(
        (member) =>
          member.userId !== creatorId &&
          member.response !== MatchProposalMemberResponse.DECLINED,
      );
      if (
        source.inviteeIds.some(
          (inviteeId) =>
            !proposalInvitees.some((member) => member.userId === inviteeId),
        )
      ) {
        throw new ApiError(400, 'Proposal invitee is not a member');
      }
      host = hostMember.intent as PreparedIntent;
      invitees = proposalInvitees
        .filter((member) => inviteeIds.has(member.userId))
        .map((member) => member.intent as PreparedIntent);
      const excluded = proposalInvitees.filter(
        (member) => !inviteeIds.has(member.userId),
      );
      excludedProposalMembers.push(...excluded);
      sourceProposalIntentIds = new Set([
        hostMember.intentId,
        ...proposalInvitees.map((member) => member.intentId),
      ]);
      proposalId = proposal.id;
    } else {
      const userIds = [creatorId, ...source.invitees.map((entry) => entry.userId)];
      const intentIds = [source.hostIntentId, ...source.invitees.map((entry) => entry.intentId)];
      if (new Set(userIds).size !== userIds.length || new Set(intentIds).size !== intentIds.length) {
        throw new ApiError(400, 'Duplicate play intent create source');
      }
      const intents = await tx.playIntent.findMany({
        where: { id: { in: intentIds } },
        include: intentInclude,
      });
      const byId = new Map(intents.map((intent) => [intent.id, intent]));
      host = (byId.get(source.hostIntentId) as PreparedIntent | undefined) ?? null;
      if (!host || host.userId !== creatorId) {
        throw new ApiError(403, 'Invalid host play intent');
      }
      invitees = source.invitees.map((entry) => {
        const intent = byId.get(entry.intentId) as PreparedIntent | undefined;
        if (!intent || intent.userId !== entry.userId) {
          throw new ApiError(400, 'Invalid invitee play intent');
        }
        return intent;
      });
    }

    const city = await tx.city.findUnique({
      where: { id: context.cityId },
      select: { timezone: true },
    });
    if (!city) throw new ApiError(404, 'City not found');
    const gameCriteria = {
      entityType: context.entityType,
      dateKey: formatInTimeZone(context.startTime, city.timezone, 'yyyy-MM-dd'),
      clubId: context.clubId,
      startTime: context.startTime,
      startTimeMinutes: timeStringToMinutes(
        formatInTimeZone(context.startTime, city.timezone, 'HH:mm'),
      ),
      minLevel: context.minLevel,
      maxLevel: context.maxLevel,
      genderTeams: context.genderTeams,
    };

    const linkedIntents = [host, ...invitees];
    if (linkedIntents.length > context.maxParticipants) {
      throw new ApiError(400, 'Play-intent roster exceeds game capacity', true, {
        code: 'playIntent.rosterTooLarge',
        maxParticipants: context.maxParticipants,
      });
    }
    for (const intent of linkedIntents) {
      const criteria = PlayIntentService.toCriteria(intent);
      const sameWorld =
        intent.cityId === context.cityId &&
        intent.sport === context.sport &&
        intent.entityType === context.entityType;
      if (!sameWorld || !intentMatchesGame(criteria, gameCriteria, now)) {
        throw new ApiError(409, 'Game no longer matches the play intent', true, {
          code: 'playIntent.gameMismatch',
          reason: sameWorld ? gameMismatch(criteria, gameCriteria)?.reason : undefined,
          userId: intent.userId,
        });
      }
    }

    const linkedIntentIds = new Set([host.id, ...invitees.map((intent) => intent.id)]);
    const supersededProposals = await tx.matchProposal.findMany({
      where: {
        id: proposalId ? { not: proposalId } : undefined,
        gameId: null,
        status: {
          in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
        },
        members: { some: { intentId: { in: [...linkedIntentIds] } } },
      },
      include: { members: { select: { intentId: true } } },
      orderBy: { id: 'asc' },
    });
    const lockedSupersededProposals: typeof supersededProposals = [];
    const proposalIdsToLock = [
      ...new Set([
        ...supersededProposals.map((proposal) => proposal.id),
        ...(proposalId ? [proposalId] : []),
      ]),
    ].sort();
    for (const lockedProposalId of proposalIdsToLock) {
      await lockMatchProposal(tx, lockedProposalId);
      if (lockedProposalId === proposalId) {
        const currentSource = await tx.matchProposal.findFirst({
          where: {
            id: lockedProposalId,
            status: MatchProposalStatus.ACCEPTED,
            hostUserId: creatorId,
            gameId: null,
            expiresAt: { gt: now },
          },
          include: { members: true },
        });
        const currentIntentIds = new Set(
          currentSource?.members
            .filter(
              (member) =>
                member.response !== MatchProposalMemberResponse.DECLINED,
            )
            .map((member) => member.intentId) ?? [],
        );
        if (
          !currentSource ||
          !sourceProposalIntentIds ||
          currentIntentIds.size !== sourceProposalIntentIds.size ||
          [...sourceProposalIntentIds].some(
            (intentId) => !currentIntentIds.has(intentId),
          )
        ) {
          throw new ApiError(409, 'Match proposal changed before game creation');
        }
        continue;
      }
      const current = await tx.matchProposal.findFirst({
        where: {
          id: lockedProposalId,
          gameId: null,
          status: {
            in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
          },
        },
        include: { members: { select: { intentId: true } } },
      });
      if (!current) continue;
      lockedSupersededProposals.push(current);
    }
    for (const member of excludedProposalMembers) {
      await tx.matchProposalMember.update({
        where: { id: member.id },
        data: { response: MatchProposalMemberResponse.DECLINED },
      });
    }
    const intentIdsToRelease = new Set(
      excludedProposalMembers.map((member) => member.intentId),
    );
    for (const current of lockedSupersededProposals) {
      await tx.matchProposal.update({
        where: { id: current.id },
        data: {
          status: MatchProposalStatus.DECLINED,
          hostUserId: null,
        },
      });
      for (const member of current.members) {
        if (!linkedIntentIds.has(member.intentId)) {
          intentIdsToRelease.add(member.intentId);
        }
      }
    }
    const linkedIntentsById = new Map(
      linkedIntents.map((intent) => [intent.id, intent]),
    );
    const intentIdsToMutate = [
      ...new Set([...linkedIntentIds, ...intentIdsToRelease]),
    ].sort();
    for (const intentId of intentIdsToMutate) {
      const linkedIntent = linkedIntentsById.get(intentId);
      if (linkedIntent) {
        await PlayIntentGameLifecycleService.reserve(
          tx,
          linkedIntent.id,
          linkedIntent.userId,
          now,
        );
      } else {
        await PlayIntentGameLifecycleService.release(tx, intentId, now);
      }
    }

    return {
      source,
      host,
      invitees,
      proposalId,
      releasedIntentIds: [...intentIdsToRelease],
    };
  }

  static participantCreates(prepared: PreparedSource | null) {
    if (!prepared) return null;
    return [
      {
        userId: prepared.host.userId,
        role: ParticipantRole.OWNER,
        status: ParticipantStatus.PLAYING,
        playIntentId: prepared.host.id,
      },
      ...prepared.invitees.map((intent) => ({
        userId: intent.userId,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.INVITED,
        invitedByUserId: prepared.host.userId,
        inviteExpiresAt: intent.expiresAt,
        playIntentId: intent.id,
      })),
    ];
  }

  static async finalize(
    tx: TransactionClient,
    prepared: PreparedSource | null,
    gameId: string,
    now: Date,
  ): Promise<void> {
    if (!prepared) return;
    await PlayIntentGameLifecycleService.consume(
      tx,
      prepared.host.id,
      prepared.host.userId,
      now,
    );
    if (prepared.proposalId) {
      const converted = await tx.matchProposal.updateMany({
        where: {
          id: prepared.proposalId,
          status: MatchProposalStatus.ACCEPTED,
          hostUserId: prepared.host.userId,
          gameId: null,
        },
        data: {
          status: MatchProposalStatus.CONVERTED_TO_GAME,
          gameId,
        },
      });
      if (converted.count !== 1) {
        throw new ApiError(409, 'Match proposal was already converted');
      }
    }
  }
}
