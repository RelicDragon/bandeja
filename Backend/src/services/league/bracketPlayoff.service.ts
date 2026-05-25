import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  BracketScope,
  BracketSlotKind,
  PlayoffFormat,
  Prisma,
  RoundType,
} from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import {
  buildBracketPlan,
  BracketPlan,
  consolationRoundLabel,
  CustomPlayInPairing,
  losersRoundLabel,
  mainFirstRoundPairings,
  mainRoundLabel,
  validateByeSeedRanks,
} from './bracketStructure';
import { createLeagueGame, PlayoffGameSetupOverrides } from './gameCreation.util';
import { BracketAdvancementService } from './bracketAdvancement.service';
import { BracketGameNotificationService } from './bracketGameNotification.service';
import {
  assertEditablePhase,
  hasBlockingDownstreamMainFinal,
  slotAcceptsParticipantAssignment,
  slotAcceptsSideAssignment,
  slotsById,
} from './bracketSlotEdit.util';
import {
  buildEqualTopKQualifiers,
  buildUnequalQualifiersFromPayload,
  buildUnequalTopKQualifiers,
  canonicalGroupOrder,
  crossGroupSeedingErrorToMessage,
  CrossGroupSeedingPreset,
  mergeGlobalParticipantIds,
  TeamsPerGroupEntry,
  validateCrossGroupPool,
  validateUnequalCrossGroupPool,
} from './crossGroupBracketSeeding';

export type BracketScopeDto = 'PER_GROUP' | 'CROSS_GROUP';

export interface CreateBracketPlayoffGroupPayload {
  leagueGroupId: string;
  participantIds: string[];
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairing[];
}

export interface CreateBracketPlayoffPayload {
  bracketScope?: BracketScopeDto;
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairing[];
  groups?: CreateBracketPlayoffGroupPayload[];
  crossGroup?: {
    equalTopK?: number;
    unequalK?: boolean;
    teamsPerGroup?: TeamsPerGroupEntry[];
    includedGroupIds?: string[];
    seedingPreset: CrossGroupSeedingPreset;
    globalParticipantIds?: string[];
    qualifiers?: { leagueGroupId: string; participantIds: string[] }[];
    includeThirdPlace?: boolean;
    includeConsolationBracket?: boolean;
    includeDoubleElimination?: boolean;
    customByeSeedRanks?: number[];
    customPlayInPairings?: CustomPlayInPairing[];
  };
  gameSetup?: PlayoffGameSetupOverrides;
}

function bracketPlanOptionsFromPayload(
  entrantCount: number,
  opts?: {
    includeThirdPlace?: boolean;
    includeConsolationBracket?: boolean;
    includeDoubleElimination?: boolean;
    customByeSeedRanks?: number[];
    customPlayInPairings?: CustomPlayInPairing[];
  }
) {
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(entrantCount)));
  const byes = bracketSize - entrantCount;
  if (opts?.customByeSeedRanks?.length) {
    validateByeSeedRanks(opts.customByeSeedRanks, entrantCount, byes);
  }
  if (
    !opts?.includeThirdPlace &&
    !opts?.includeConsolationBracket &&
    !opts?.includeDoubleElimination &&
    !opts?.customByeSeedRanks?.length &&
    !opts?.customPlayInPairings?.length
  ) {
    return undefined;
  }
  return {
    includeThirdPlace: opts.includeThirdPlace,
    includeConsolationBracket: opts.includeConsolationBracket,
    includeDoubleElimination: opts.includeDoubleElimination,
    byeSeedRanks: opts.customByeSeedRanks,
    customPlayInPairings: opts.customPlayInPairings,
  };
}

type BracketGroupConfigEntry = {
  participantIds: string[];
  entrantCount?: number;
  bracketSize?: number;
  byeCount?: number;
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
};

type BracketConfigShape = {
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  groups?: Record<string, BracketGroupConfigEntry>;
  scope?: 'CROSS_GROUP';
  bracketSummarySent?: Record<string, boolean>;
  equalTopK?: number;
  unequalK?: boolean;
  teamsPerGroup?: TeamsPerGroupEntry[];
  includedGroupIds?: string[];
  qualifiers?: Record<string, { participantIds: string[] }>;
  globalParticipantIds?: string[];
  seedingPreset?: CrossGroupSeedingPreset;
  seedingLocked?: boolean;
  audit?: BracketAuditEntry[];
};

export interface PatchBracketSlotUpdate {
  slotId: string;
  leagueParticipantId?: string | null;
  side?: 'A' | 'B';
}

export interface BracketGameTeamUpdate {
  gameId: string;
  participantA: string;
  participantB: string;
}

export interface PatchBracketSlotsPayload {
  slots?: PatchBracketSlotUpdate[];
  gameTeamUpdates?: BracketGameTeamUpdate[];
  roundId?: string;
  seedingLocked?: boolean;
}

type SlotRow = {
  id: string;
  slotKey: string;
  slotKind: BracketSlotKind;
  phaseIndex: number;
  roundIndex: number;
  matchIndex: number;
  leagueParticipantId: string | null;
  gameId: string | null;
  seedRank: number | null;
  feederSlotAId: string | null;
  feederSlotBId: string | null;
  winnerSlotId: string | null;
  game?: {
    id: string;
    resultsStatus: string;
    status: string;
    startTime: Date;
    endTime: Date;
  } | null;
  leagueParticipant?: {
    id: string;
    leagueTeam?: {
      players: { userId: string; user: { id: string; firstName: string | null; lastName: string | null } }[];
    } | null;
  } | null;
};

export class BracketPlayoffService {
  static async createBracketPlayoff(
    leagueSeasonId: string,
    userId: string,
    payload: CreateBracketPlayoffPayload
  ) {
    const scope = payload.bracketScope ?? 'PER_GROUP';
    if (payload.groups?.length && payload.crossGroup) {
      throw new ApiError(400, 'Provide either groups or crossGroup, not both');
    }
    if (scope === 'CROSS_GROUP') {
      return this.createCrossGroupBracketPlayoff(leagueSeasonId, userId, payload);
    }
    if (payload.crossGroup) {
      throw new ApiError(400, 'crossGroup requires bracketScope CROSS_GROUP');
    }
    return this.createPerGroupBracketPlayoff(leagueSeasonId, userId, payload);
  }

  private static async createPerGroupBracketPlayoff(
    leagueSeasonId: string,
    userId: string,
    payload: CreateBracketPlayoffPayload
  ) {
    const {
      groups,
      gameSetup,
      includeThirdPlace = false,
      includeConsolationBracket = false,
      includeDoubleElimination = false,
    } =
      payload;
    if (!groups?.length) {
      throw new ApiError(400, 'groups must not be empty');
    }
    if (groups.length > 1 && payload.customByeSeedRanks?.length) {
      throw new ApiError(400, 'customByeSeedRanks must be set per group when creating multiple groups');
    }

    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: {
          include: {
            participants: {
              where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
            },
          },
        },
      },
    });

    if (!leagueSeason?.game) {
      throw new ApiError(404, 'League season not found');
    }

    if (!leagueSeason.game.hasFixedTeams) {
      throw new ApiError(400, 'Bracket playoffs require fixed teams');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    if (leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can create playoff');
    }

    for (const g of groups) {
      const n = g.participantIds?.length ?? 0;
      if (n < 2 || n > 16) {
        throw new ApiError(400, 'Each group must have between 2 and 16 participants');
      }
      if (new Set(g.participantIds).size !== n) {
        throw new ApiError(400, 'participantIds must be distinct per group');
      }
    }

    const groupIds = groups.map((g) => g.leagueGroupId);
    if (new Set(groupIds).size !== groupIds.length) {
      throw new ApiError(400, 'Duplicate leagueGroupId in groups');
    }

    const seasonGroupIds = new Set(
      (await prisma.leagueGroup.findMany({ where: { leagueSeasonId }, select: { id: true } })).map((x) => x.id)
    );
    for (const g of groups) {
      if (!seasonGroupIds.has(g.leagueGroupId)) {
        throw new ApiError(400, 'One or more groups do not belong to this league season');
      }
    }

    const allParticipantIds = groups.flatMap((g) => g.participantIds);
    const participants = await prisma.leagueParticipant.findMany({
      where: { id: { in: allParticipantIds }, leagueSeasonId },
      include: {
        leagueTeam: {
          include: {
            players: { include: { user: { select: USER_SELECT_FIELDS } } },
          },
        },
      },
    });

    if (participants.length !== allParticipantIds.length) {
      throw new ApiError(400, 'Invalid or duplicate participant selection');
    }

    for (const p of participants) {
      if (p.participantType !== 'TEAM' || !p.leagueTeam?.players?.length) {
        throw new ApiError(400, 'Bracket playoffs require TEAM participants with valid rosters');
      }
    }

    const participantById = new Map(participants.map((p) => [p.id, p]));
    for (const g of groups) {
      for (const pid of g.participantIds) {
        const p = participantById.get(pid);
        if (!p || p.currentGroupId !== g.leagueGroupId) {
          throw new ApiError(400, 'Participant does not belong to the specified group');
        }
      }
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeason.game.id },
      include: {
        participants: { include: { user: { select: USER_SELECT_FIELDS } } },
        fixedTeams: {
          include: { players: { include: { user: { select: USER_SELECT_FIELDS } } } },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });
    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    let round: { id: string };
    const createdGameIds: string[] = [];
    const bracketConfig: Record<string, BracketGroupConfigEntry> = {};
    const groupPlans = groups.map((g) => {
      const n = g.participantIds.length;
      const planOpts = {
        includeThirdPlace: g.includeThirdPlace ?? includeThirdPlace,
        includeConsolationBracket: g.includeConsolationBracket ?? includeConsolationBracket,
        includeDoubleElimination: g.includeDoubleElimination ?? includeDoubleElimination,
        customByeSeedRanks:
          g.customByeSeedRanks ?? (groups.length === 1 ? payload.customByeSeedRanks : undefined),
        customPlayInPairings:
          g.customPlayInPairings ??
          (groups.length === 1 ? payload.customPlayInPairings : undefined),
      };
      const plan = buildBracketPlan(n, g.participantIds, bracketPlanOptionsFromPayload(n, planOpts));
      bracketConfig[g.leagueGroupId] = {
        participantIds: g.participantIds,
        entrantCount: plan.entrantCount,
        bracketSize: plan.bracketSize,
        byeCount: plan.byeCount,
        includeThirdPlace: plan.includeThirdPlace,
        includeConsolationBracket: plan.includeConsolationBracket,
        includeDoubleElimination: plan.includeDoubleElimination,
        customByeSeedRanks: g.customByeSeedRanks,
      };
      return { ...g, plan };
    });
    const multiGroup = groups.length > 1;
    const singlePlan = groupPlans[0].plan;

    await prisma.$transaction(async (tx) => {
      const existingRounds = await tx.leagueRound.findMany({
        where: { leagueSeasonId },
        orderBy: { orderIndex: 'desc' },
        take: 1,
      });
      const nextOrderIndex = existingRounds.length > 0 ? existingRounds[0].orderIndex + 1 : 0;
      round = await tx.leagueRound.create({
        data: {
          leagueSeasonId,
          orderIndex: nextOrderIndex,
          roundType: RoundType.PLAYOFF,
          playoffFormat: PlayoffFormat.BRACKET,
          bracketScope: BracketScope.PER_GROUP,
          entrantCount: multiGroup ? null : singlePlan.entrantCount,
          bracketSize: multiGroup ? null : singlePlan.bracketSize,
          byeCount: multiGroup ? null : singlePlan.byeCount,
          bracketTemplateVersion: singlePlan.bracketTemplateVersion,
          bracketConfig: {
            groups: bracketConfig,
            seedingLocked: false,
            includeThirdPlace:
              groupPlans.some((gp) => gp.plan.includeThirdPlace) || includeThirdPlace,
            includeConsolationBracket:
              groupPlans.some((gp) => gp.plan.includeConsolationBracket) ||
              includeConsolationBracket,
            includeDoubleElimination:
              groupPlans.some((gp) => gp.plan.includeDoubleElimination) ||
              includeDoubleElimination,
          },
        },
      });

      for (const g of groupPlans) {
        const ids = await this.persistGroupBracket(tx, {
          roundId: round.id,
          leagueSeasonId,
          leagueGroupId: g.leagueGroupId,
          plan: g.plan,
          orderedParticipantIds: g.participantIds,
          seasonGame,
          gameSetup,
        });
        createdGameIds.push(...ids);
      }
    });

    BracketGameNotificationService.notifyCreatedGames(createdGameIds);

    return this.getBracketPlayoff(leagueSeasonId, userId);
  }

  private static async createCrossGroupBracketPlayoff(
    leagueSeasonId: string,
    userId: string,
    payload: CreateBracketPlayoffPayload
  ) {
    const { crossGroup, gameSetup } = payload;
    if (!crossGroup) {
      throw new ApiError(400, 'crossGroup is required for CROSS_GROUP bracket');
    }

    const useUnequal =
      crossGroup.unequalK === true ||
      (crossGroup.teamsPerGroup?.length ?? 0) > 0;
    const k = crossGroup.equalTopK;
    if (!useUnequal) {
      if (!Number.isInteger(k) || k! < 1) {
        throw new ApiError(400, 'equalTopK must be a positive integer');
      }
    } else if (k != null && (!Number.isInteger(k) || k < 1)) {
      throw new ApiError(400, 'equalTopK must be a positive integer when provided');
    }
    if (useUnequal && crossGroup.teamsPerGroup?.length) {
      for (const entry of crossGroup.teamsPerGroup) {
        if (!entry.leagueGroupId || !Number.isInteger(entry.k) || entry.k < 1) {
          throw new ApiError(400, 'teamsPerGroup entries require leagueGroupId and positive k');
        }
      }
    }
    if (
      useUnequal &&
      !crossGroup.qualifiers?.length &&
      !crossGroup.teamsPerGroup?.length
    ) {
      throw new ApiError(400, 'unequalK requires teamsPerGroup or qualifiers');
    }

    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: {
          include: {
            participants: {
              where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
            },
          },
        },
        groups: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!leagueSeason?.game) {
      throw new ApiError(404, 'League season not found');
    }
    if (!leagueSeason.game.hasFixedTeams) {
      throw new ApiError(400, 'Bracket playoffs require fixed teams');
    }
    if (leagueSeason.groups.length < 2) {
      throw new ApiError(400, 'Cross-group bracket requires at least 2 groups in the season');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    if (leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can create playoff');
    }

    const seasonGroupIds = new Set(leagueSeason.groups.map((g) => g.id));
    const includedGroupIds =
      crossGroup.includedGroupIds?.length
        ? crossGroup.includedGroupIds
        : leagueSeason.groups.map((g) => g.id);

    if (includedGroupIds.length < 2) {
      throw new ApiError(400, 'Cross-group bracket requires at least 2 included groups');
    }
    for (const gid of includedGroupIds) {
      if (!seasonGroupIds.has(gid)) {
        throw new ApiError(400, 'One or more included groups do not belong to this league season');
      }
    }

    const groupOrder = canonicalGroupOrder(
      leagueSeason.groups.filter((g) => includedGroupIds.includes(g.id))
    );

    let qualifiers: Record<string, string[]>;
    try {
      if (crossGroup.qualifiers?.length) {
        qualifiers = useUnequal
          ? buildUnequalQualifiersFromPayload(crossGroup.qualifiers)
          : buildEqualTopKQualifiers(crossGroup.qualifiers, k!);
      } else if (useUnequal && crossGroup.teamsPerGroup?.length) {
        const built: { leagueGroupId: string; participantIds: string[] }[] = [];
        for (const gid of includedGroupIds) {
          const ids = await this.loadGroupStandingsParticipantIds(leagueSeasonId, gid);
          built.push({ leagueGroupId: gid, participantIds: ids });
        }
        qualifiers = buildUnequalTopKQualifiers(crossGroup.teamsPerGroup, built);
      } else {
        const built: { leagueGroupId: string; participantIds: string[] }[] = [];
        for (const gid of includedGroupIds) {
          const ids = await this.loadGroupStandingsParticipantIds(leagueSeasonId, gid);
          built.push({ leagueGroupId: gid, participantIds: ids });
        }
        qualifiers = buildEqualTopKQualifiers(built, k!);
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const names = new Map(leagueSeason.groups.map((g) => [g.id, g.name]));
      throw new ApiError(400, crossGroupSeedingErrorToMessage(code, names));
    }

    let globalParticipantIds: string[];
    try {
      globalParticipantIds = mergeGlobalParticipantIds(
        qualifiers,
        groupOrder,
        crossGroup.seedingPreset,
        crossGroup.globalParticipantIds
      );
      if (useUnequal) {
        validateUnequalCrossGroupPool({
          includedGroupIds,
          qualifiers,
          globalParticipantIds,
          teamsPerGroup: crossGroup.teamsPerGroup,
        });
      } else {
        validateCrossGroupPool({ k: k!, includedGroupIds, qualifiers, globalParticipantIds });
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      throw new ApiError(400, crossGroupSeedingErrorToMessage(code));
    }

    const allParticipantIds = globalParticipantIds;
    const participants = await prisma.leagueParticipant.findMany({
      where: { id: { in: allParticipantIds }, leagueSeasonId },
      include: {
        leagueTeam: {
          include: {
            players: { include: { user: { select: USER_SELECT_FIELDS } } },
          },
        },
      },
    });
    if (participants.length !== allParticipantIds.length) {
      throw new ApiError(400, 'Invalid or duplicate participant selection');
    }
    for (const p of participants) {
      if (p.participantType !== 'TEAM' || !p.leagueTeam?.players?.length) {
        throw new ApiError(400, 'Bracket playoffs require TEAM participants with valid rosters');
      }
      if (!p.currentGroupId || !includedGroupIds.includes(p.currentGroupId)) {
        throw new ApiError(400, 'Participant does not belong to an included group');
      }
      const row = qualifiers[p.currentGroupId];
      if (!row?.includes(p.id)) {
        throw new ApiError(400, 'Participant is not among the selected qualifiers for their group');
      }
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeason.game.id },
      include: {
        participants: { include: { user: { select: USER_SELECT_FIELDS } } },
        fixedTeams: {
          include: { players: { include: { user: { select: USER_SELECT_FIELDS } } } },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });
    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    const plan = buildBracketPlan(
      globalParticipantIds.length,
      globalParticipantIds,
      bracketPlanOptionsFromPayload(globalParticipantIds.length, {
        includeThirdPlace: crossGroup.includeThirdPlace,
        includeConsolationBracket:
          crossGroup.includeConsolationBracket ?? payload.includeConsolationBracket,
        includeDoubleElimination:
          crossGroup.includeDoubleElimination ?? payload.includeDoubleElimination,
        customByeSeedRanks: crossGroup.customByeSeedRanks,
        customPlayInPairings: crossGroup.customPlayInPairings ?? payload.customPlayInPairings,
      })
    );
    const maxK = Math.max(...includedGroupIds.map((gid) => qualifiers[gid]?.length ?? 0));
    const bracketConfig: BracketConfigShape = {
      scope: 'CROSS_GROUP',
      equalTopK: useUnequal ? maxK : k,
      unequalK: useUnequal || undefined,
      teamsPerGroup: crossGroup.teamsPerGroup,
      includedGroupIds,
      qualifiers: Object.fromEntries(
        Object.entries(qualifiers).map(([gid, ids]) => [gid, { participantIds: ids }])
      ),
      globalParticipantIds,
      seedingPreset: crossGroup.seedingPreset,
      seedingLocked: false,
      includeThirdPlace: plan.includeThirdPlace,
      includeConsolationBracket: plan.includeConsolationBracket,
      includeDoubleElimination: plan.includeDoubleElimination,
      customByeSeedRanks: crossGroup.customByeSeedRanks,
    };

    let round: { id: string };
    const createdGameIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      const existingRounds = await tx.leagueRound.findMany({
        where: { leagueSeasonId },
        orderBy: { orderIndex: 'desc' },
        take: 1,
      });
      const nextOrderIndex = existingRounds.length > 0 ? existingRounds[0].orderIndex + 1 : 0;
      round = await tx.leagueRound.create({
        data: {
          leagueSeasonId,
          orderIndex: nextOrderIndex,
          roundType: RoundType.PLAYOFF,
          playoffFormat: PlayoffFormat.BRACKET,
          bracketScope: BracketScope.CROSS_GROUP,
          entrantCount: plan.entrantCount,
          bracketSize: plan.bracketSize,
          byeCount: plan.byeCount,
          bracketTemplateVersion: plan.bracketTemplateVersion,
          bracketConfig: bracketConfig as Prisma.InputJsonValue,
        },
      });

      const ids = await this.persistGroupBracket(tx, {
        roundId: round.id,
        leagueSeasonId,
        leagueGroupId: null,
        plan,
        orderedParticipantIds: globalParticipantIds,
        seasonGame,
        gameSetup,
      });
      createdGameIds.push(...ids);
    });

    BracketGameNotificationService.notifyCreatedGames(createdGameIds);

    return this.getBracketPlayoff(leagueSeasonId, userId);
  }

  private static async loadGroupStandingsParticipantIds(
    leagueSeasonId: string,
    groupId: string
  ): Promise<string[]> {
    const participants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId, currentGroupId: groupId, participantType: 'TEAM' },
      include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
      orderBy: [{ points: 'desc' }, { wins: 'desc' }, { scoreDelta: 'desc' }],
    });
    return participants
      .filter((p) => p.leagueTeam?.players?.length)
      .map((p) => p.id);
  }

  private static async persistGroupBracket(
    tx: Prisma.TransactionClient,
    params: {
      roundId: string;
      leagueSeasonId: string;
      leagueGroupId: string | null;
      plan: BracketPlan;
      orderedParticipantIds: string[];
      seasonGame: Parameters<typeof createLeagueGame>[0]['seasonGame'];
      gameSetup?: PlayoffGameSetupOverrides;
    }
  ): Promise<string[]> {
    const { roundId, leagueSeasonId, leagueGroupId, plan, orderedParticipantIds, seasonGame, gameSetup } = params;
    const keyToId = new Map<string, string>();

    for (const planned of plan.slots) {
      const row = await tx.leagueBracketSlot.create({
        data: {
          leagueRoundId: roundId,
          leagueGroupId,
          slotKey: planned.slotKey,
          slotKind: planned.slotKind,
          phaseIndex: planned.phaseIndex,
          roundIndex: planned.roundIndex,
          matchIndex: planned.matchIndex,
          leagueParticipantId: planned.leagueParticipantId,
          seedRank: planned.seedRank,
        },
      });
      keyToId.set(planned.slotKey, row.id);
    }

    for (const planned of plan.slots) {
      await tx.leagueBracketSlot.update({
        where: { id: keyToId.get(planned.slotKey)! },
        data: {
          winnerSlotId: planned.winnerSlotKey ? keyToId.get(planned.winnerSlotKey) ?? null : null,
          feederSlotAId: planned.feederSlotAKey ? keyToId.get(planned.feederSlotAKey) ?? null : null,
          feederSlotBId: planned.feederSlotBKey ? keyToId.get(planned.feederSlotBKey) ?? null : null,
        },
      });
    }

    const createdGameIds: string[] = [];
    for (const slotKey of plan.initialGameSlotKeys) {
      const slotId = keyToId.get(slotKey)!;
      const planned = plan.slots.find((s) => s.slotKey === slotKey)!;
      const gameId = await BracketAdvancementService.createGameForSlot(tx, {
        slotId,
        planned,
        orderedParticipantIds,
        leagueSeasonId,
        leagueGroupId,
        roundId,
        seasonGame,
        gameSetup,
      });
      if (gameId) createdGameIds.push(gameId);
    }
    return createdGameIds;
  }

  static async getBracketPlayoff(
    leagueSeasonId: string,
    _userId?: string,
    opts?: { roundId?: string; leagueGroupId?: string }
  ) {
    const round = await prisma.leagueRound.findFirst({
      where: {
        leagueSeasonId,
        roundType: RoundType.PLAYOFF,
        playoffFormat: PlayoffFormat.BRACKET,
        ...(opts?.roundId ? { id: opts.roundId } : {}),
      },
      orderBy: { orderIndex: 'desc' },
      include: {
        bracketSlots: {
          include: {
            game: {
              select: {
                id: true,
                resultsStatus: true,
                status: true,
                startTime: true,
                endTime: true,
              },
            },
            leagueParticipant: {
              include: {
                currentGroup: { select: { id: true, name: true, color: true } },
                leagueTeam: {
                  include: {
                    players: {
                      include: { user: { select: USER_SELECT_FIELDS } },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ leagueGroupId: 'asc' }, { phaseIndex: 'asc' }, { roundIndex: 'asc' }, { matchIndex: 'asc' }],
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'Bracket playoff round not found');
    }

    const config = round.bracketConfig as BracketConfigShape | null;
    const isCross = round.bracketScope === BracketScope.CROSS_GROUP;

    const byGroup = new Map<string | null, SlotRow[]>();
    for (const slot of round.bracketSlots) {
      const key = slot.leagueGroupId;
      const list = byGroup.get(key) ?? [];
      list.push(slot);
      byGroup.set(key, list);
    }

    let groupEntries = [...byGroup.entries()];
    if (!isCross && opts?.leagueGroupId) {
      groupEntries = groupEntries.filter(([gid]) => gid === opts.leagueGroupId);
    }

    const groups = await Promise.all(
      groupEntries.map(async ([leagueGroupId, slots]) => {
        const configEntry =
          leagueGroupId != null ? config?.groups?.[leagueGroupId] : undefined;
        const entrantCount = isCross
          ? (round.entrantCount ?? config?.globalParticipantIds?.length ?? 0)
          : (configEntry?.entrantCount ??
            configEntry?.participantIds?.length ??
            round.entrantCount ??
            slots.filter((s) => s.seedRank != null).length);
        const bracketSize = isCross
          ? round.bracketSize
          : (configEntry?.bracketSize ?? round.bracketSize);
        const byeCount = isCross ? round.byeCount : (configEntry?.byeCount ?? round.byeCount);
        const playInGameCount = slots.filter((s) => s.slotKind === BracketSlotKind.PLAY_IN).length;
        const grandFinalSlot = slots.find((s) => s.slotKind === BracketSlotKind.GRAND_FINAL);
        const finalSlot =
          grandFinalSlot ??
          slots.find((s) => s.slotKind === BracketSlotKind.MAIN && s.winnerSlotId == null);
        let championParticipantId: string | undefined;
        let finalistParticipantId: string | undefined;
        let thirdPlaceParticipantId: string | undefined;
        if (finalSlot?.gameId && finalSlot.game?.resultsStatus === 'FINAL') {
          const champ = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
            finalSlot.gameId
          );
          championParticipantId = champ ?? undefined;
          const finalist = await BracketAdvancementService.resolveLoserParticipantIdFromGame(
            finalSlot.gameId
          );
          finalistParticipantId = finalist ?? undefined;
        }
        const thirdSlot = slots.find((s) => s.slotKind === BracketSlotKind.THIRD_PLACE);
        if (thirdSlot?.gameId && thirdSlot.game?.resultsStatus === 'FINAL') {
          const third = await BracketAdvancementService.resolveWinnerParticipantIdFromGame(
            thirdSlot.gameId
          );
          thirdPlaceParticipantId = third ?? undefined;
        }
        const includeThirdPlaceFlag =
          config?.includeThirdPlace ??
          configEntry?.includeThirdPlace ??
          Boolean(thirdSlot);
        const hasConsolation = slots.some((s) => s.slotKind === BracketSlotKind.CONSOLATION);
        const includeConsolationBracketFlag =
          config?.includeConsolationBracket ??
          configEntry?.includeConsolationBracket ??
          hasConsolation;
        const hasDoubleElim = slots.some((s) => s.slotKind === BracketSlotKind.GRAND_FINAL);
        const includeDoubleEliminationFlag =
          config?.includeDoubleElimination ??
          configEntry?.includeDoubleElimination ??
          hasDoubleElim;

        return {
          leagueGroupId,
          entrantCount,
          bracketSize,
          byeCount,
          playInGameCount,
          includeThirdPlace: includeThirdPlaceFlag,
          includeConsolationBracket: includeConsolationBracketFlag,
          includeDoubleElimination: includeDoubleEliminationFlag,
          championParticipantId,
          finalistParticipantId,
          thirdPlaceParticipantId,
          slots: slots.map((s) => {
            const lp = s.leagueParticipant as
              | {
                  currentGroupId?: string | null;
                  currentGroup?: { id: string; name: string; color: string | null } | null;
                }
              | null
              | undefined;
            const originGroupId = lp?.currentGroupId ?? undefined;
            const originGroup = lp?.currentGroup ?? undefined;
            return {
              id: s.id,
              slotKey: s.slotKey,
              slotKind: s.slotKind,
              phaseIndex: s.phaseIndex,
              roundIndex: s.roundIndex,
              matchIndex: s.matchIndex,
              seedRank: s.seedRank,
              leagueParticipantId: s.leagueParticipantId,
              gameId: s.gameId,
              winnerSlotId: s.winnerSlotId,
              feederSlotAId: s.feederSlotAId,
              feederSlotBId: s.feederSlotBId,
              roundLabel: roundLabelForSlot(s, bracketSize ?? 8, slots),
              game: s.game,
              participant: s.leagueParticipant,
              originGroupId,
              originGroup: originGroup
                ? { id: originGroup.id, name: originGroup.name, color: originGroup.color }
                : undefined,
            };
          }),
        };
      })
    );

    return {
      round: {
        id: round.id,
        leagueSeasonId: round.leagueSeasonId,
        orderIndex: round.orderIndex,
        roundType: round.roundType,
        playoffFormat: round.playoffFormat,
        bracketScope: round.bracketScope,
        entrantCount: round.entrantCount,
        bracketSize: round.bracketSize,
        byeCount: round.byeCount,
        bracketTemplateVersion: round.bracketTemplateVersion,
        bracketConfig: round.bracketConfig,
      },
      groups,
    };
  }

  static async patchBracketSlots(
    leagueSeasonId: string,
    userId: string,
    payload: PatchBracketSlotsPayload
  ) {
    const updates = payload.slots ?? [];
    const gameTeamUpdates = payload.gameTeamUpdates ?? [];
    const seedingLockedOnly =
      payload.seedingLocked !== undefined &&
      updates.length === 0 &&
      gameTeamUpdates.length === 0;
    if (updates.length === 0 && gameTeamUpdates.length === 0 && !seedingLockedOnly) {
      throw new ApiError(400, 'slots, gameTeamUpdates, or seedingLocked must be provided');
    }

    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: {
          include: {
            participants: {
              where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
            },
          },
        },
      },
    });

    if (!leagueSeason?.game) {
      throw new ApiError(404, 'League season not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    if (leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can edit bracket slots');
    }

    const round = await prisma.leagueRound.findFirst({
      where: {
        leagueSeasonId,
        roundType: RoundType.PLAYOFF,
        playoffFormat: PlayoffFormat.BRACKET,
        ...(payload.roundId ? { id: payload.roundId } : {}),
      },
      orderBy: { orderIndex: 'desc' },
      include: {
        bracketSlots: {
          include: { game: { select: { id: true, resultsStatus: true } } },
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'Bracket playoff round not found');
    }

    const slotIds = new Set(updates.map((u) => u.slotId));
    if (slotIds.size !== updates.length) {
      throw new ApiError(400, 'Duplicate slotId in slots');
    }

    const gameIds = new Set(gameTeamUpdates.map((g) => g.gameId));
    if (gameIds.size !== gameTeamUpdates.length) {
      throw new ApiError(400, 'Duplicate gameId in gameTeamUpdates');
    }

    const config = round.bracketConfig as BracketConfigShape | null;
    const isCross = round.bracketScope === BracketScope.CROSS_GROUP;

    if (seedingLockedOnly) {
      const nextConfig: BracketConfigShape = {
        ...(config ?? {}),
        seedingLocked: payload.seedingLocked,
      };
      await prisma.leagueRound.update({
        where: { id: round.id },
        data: { bracketConfig: nextConfig as Prisma.InputJsonValue },
      });
      return this.getBracketPlayoff(leagueSeasonId, userId, { roundId: round.id });
    }

    if (updates.length > 0 && config?.seedingLocked === true) {
      throw new ApiError(409, 'Bracket seeding is locked');
    }

    const auditChanges: BracketAuditEntry['changes'] = [];
    const configGroups: Record<string, BracketGroupConfigEntry> = {
      ...(config?.groups ?? {}),
    };
    let globalParticipantIds = [...(config?.globalParticipantIds ?? [])];

    const poolForSlot = (slot: { leagueGroupId: string | null }): string[] => {
      if (isCross) return globalParticipantIds;
      if (!slot.leagueGroupId) return [];
      return configGroups[slot.leagueGroupId]?.participantIds ?? [];
    };

    const treeKey = (slot: { leagueGroupId: string | null }): string | null =>
      isCross ? null : slot.leagueGroupId;

    const createdGameIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      const slots =
        updates.length > 0
          ? await tx.leagueBracketSlot.findMany({
              where: { leagueRoundId: round.id, id: { in: [...slotIds] } },
              include: { game: { select: { id: true, resultsStatus: true } } },
            })
          : [];

      if (updates.length > 0 && slots.length !== slotIds.size) {
        throw new ApiError(400, 'One or more slotIds are invalid for this bracket');
      }

      const slotsByTree = new Map<string | null, typeof slots>();
      for (const s of round.bracketSlots) {
        const key = treeKey(s);
        const list = slotsByTree.get(key) ?? [];
        list.push(s);
        slotsByTree.set(key, list);
      }

      for (const update of updates) {
        const slot = slots.find((s) => s.id === update.slotId)!;
        const groupSlots = slotsByTree.get(treeKey(slot)) ?? [];
        const pool = poolForSlot(slot);
        const poolSet = new Set(pool);

        try {
          assertEditablePhase(slot, groupSlots);
        } catch (e) {
          const code = e instanceof Error ? e.message : '';
          if (code === 'PLAY_IN_PHASE_LOCKED') {
            throw new ApiError(409, 'Play-in results are final; bracket seeding is locked');
          }
          if (code.startsWith('MAIN_ROUND_')) {
            throw new ApiError(409, 'This knockout round has final results; seeding is locked');
          }
          throw e;
        }

        if (update.side) {
          if (!slotAcceptsSideAssignment(slot)) {
            throw new ApiError(400, 'This slot does not support side assignment');
          }
          if (!update.leagueParticipantId) {
            throw new ApiError(400, 'leagueParticipantId is required when side is set');
          }
          if (!poolSet.has(update.leagueParticipantId)) {
            throw new ApiError(
              400,
              isCross
                ? 'Participant is not in the cross-group bracket pool'
                : 'Participant is not in the bracket pool for this group'
            );
          }
          if (hasBlockingDownstreamMainFinal(slot.id, slotsById(groupSlots))) {
            throw new ApiError(
              409,
              'Cannot edit: a later knockout game is already final'
            );
          }

          auditChanges.push({
            slotId: slot.id,
            before: { leagueParticipantId: slot.leagueParticipantId, side: update.side },
            after: { leagueParticipantId: update.leagueParticipantId, side: update.side },
          });

          const byeSource = groupSlots.find(
            (s) =>
              s.slotKind === BracketSlotKind.BYE &&
              s.leagueParticipantId === update.leagueParticipantId
          );
          if (byeSource) {
            await BracketAdvancementService.cascadeClearDescendants(
              byeSource.id,
              round.id,
              treeKey(slot),
              tx,
              { excludeSlotIds: new Set([byeSource.id]) }
            );
            await tx.leagueBracketSlot.update({
              where: { id: byeSource.id },
              data: { leagueParticipantId: null },
            });
          }

          await BracketAdvancementService.cascadeClearDescendants(
            slot.id,
            round.id,
            treeKey(slot),
            tx,
            { excludeSlotIds: new Set([slot.id]) }
          );
          await BracketAdvancementService.replaceGameTeamParticipant(
            slot.gameId!,
            update.side,
            update.leagueParticipantId,
            tx
          );
          continue;
        }

        if (!slotAcceptsParticipantAssignment(slot)) {
          throw new ApiError(
            400,
            'Use side A or B for play-in and knockout match slots; BYE slots use leagueParticipantId only'
          );
        }

        const nextParticipantId = update.leagueParticipantId ?? null;
        if (nextParticipantId && !poolSet.has(nextParticipantId)) {
          throw new ApiError(
            400,
            isCross
              ? 'Participant is not in the cross-group bracket pool'
              : 'Participant is not in the bracket pool for this group'
          );
        }

        if (slot.slotKind === BracketSlotKind.BYE && nextParticipantId) {
          const otherBye = groupSlots.find(
            (s) =>
              s.slotKind === BracketSlotKind.BYE &&
              s.id !== slot.id &&
              s.leagueParticipantId === nextParticipantId
          );
          if (otherBye) {
            throw new ApiError(400, 'Participant is already assigned to another bye slot');
          }
        }

        if (hasBlockingDownstreamMainFinal(slot.id, slotsById(groupSlots))) {
          throw new ApiError(409, 'Cannot edit: a later knockout game is already final');
        }

        auditChanges.push({
          slotId: slot.id,
          before: { leagueParticipantId: slot.leagueParticipantId },
          after: { leagueParticipantId: nextParticipantId },
        });

        const participantChanged = slot.leagueParticipantId !== nextParticipantId;
        if (participantChanged) {
          await BracketAdvancementService.cascadeClearDescendants(
            slot.id,
            round.id,
            treeKey(slot),
            tx,
            { excludeSlotIds: new Set([slot.id]) }
          );
          await tx.leagueBracketSlot.update({
            where: { id: slot.id },
            data: { leagueParticipantId: nextParticipantId },
          });
          if (slot.seedRank != null) {
            if (isCross && globalParticipantIds.length) {
              const order = [...globalParticipantIds];
              order[slot.seedRank - 1] = nextParticipantId ?? order[slot.seedRank - 1];
              globalParticipantIds = order;
            } else if (slot.leagueGroupId && configGroups[slot.leagueGroupId]) {
              const order = [...configGroups[slot.leagueGroupId].participantIds];
              order[slot.seedRank - 1] = nextParticipantId ?? order[slot.seedRank - 1];
              configGroups[slot.leagueGroupId] = {
                ...configGroups[slot.leagueGroupId],
                participantIds: order,
              };
            }
          }
        }
      }

      for (const gameUpdate of gameTeamUpdates) {
        const slot = round.bracketSlots.find((s) => s.gameId === gameUpdate.gameId);
        if (!slot) {
          throw new ApiError(400, 'gameId is not linked to a bracket slot in this round');
        }
        const groupSlots = slotsByTree.get(treeKey(slot)) ?? [];
        const pool = poolForSlot(slot);
        const poolSet = new Set(pool);

        try {
          assertEditablePhase(slot, groupSlots);
        } catch (e) {
          const code = e instanceof Error ? e.message : '';
          if (code === 'PLAY_IN_PHASE_LOCKED') {
            throw new ApiError(409, 'Play-in results are final; bracket seeding is locked');
          }
          if (code.startsWith('MAIN_ROUND_')) {
            throw new ApiError(409, 'This knockout round has final results; seeding is locked');
          }
          throw e;
        }

        if (!poolSet.has(gameUpdate.participantA) || !poolSet.has(gameUpdate.participantB)) {
          throw new ApiError(
            400,
            isCross
              ? 'Participant is not in the cross-group bracket pool'
              : 'Participant is not in the bracket pool for this group'
          );
        }
        if (gameUpdate.participantA === gameUpdate.participantB) {
          throw new ApiError(400, 'Match sides must be different participants');
        }
        if (slot.game?.resultsStatus === 'FINAL') {
          throw new ApiError(409, 'Cannot edit teams on a finalized game');
        }
        if (hasBlockingDownstreamMainFinal(slot.id, slotsById(groupSlots))) {
          throw new ApiError(409, 'Cannot edit: a later knockout game is already final');
        }

        auditChanges.push({
          slotId: slot.id,
          before: { gameId: gameUpdate.gameId },
          after: {
            gameId: gameUpdate.gameId,
            participantA: gameUpdate.participantA,
            participantB: gameUpdate.participantB,
          },
        });

        await BracketAdvancementService.cascadeClearDescendants(
          slot.id,
          round.id,
          treeKey(slot),
          tx,
          { excludeSlotIds: new Set([slot.id]) }
        );
        await BracketAdvancementService.replaceGameTeamParticipant(
          gameUpdate.gameId,
          'A',
          gameUpdate.participantA,
          tx
        );
        await BracketAdvancementService.replaceGameTeamParticipant(
          gameUpdate.gameId,
          'B',
          gameUpdate.participantB,
          tx
        );

        const entrantCount = pool.length;
        const bracketSize =
          isCross
            ? (round.bracketSize ?? entrantCount)
            : (configGroups[slot.leagueGroupId!]?.bracketSize ?? round.bracketSize ?? entrantCount);
        if (entrantCount >= 2) {
          const order = isCross ? [...globalParticipantIds] : [...pool];
          if (slot.slotKind === BracketSlotKind.PLAY_IN) {
            const plan = buildBracketPlan(entrantCount, order);
            const piSlot = plan.slots.find((s) => s.slotKey === slot.slotKey);
            if (piSlot?.seedRankA != null && piSlot.seedRankB != null) {
              order[piSlot.seedRankA - 1] = gameUpdate.participantA;
              order[piSlot.seedRankB - 1] = gameUpdate.participantB;
              if (isCross) globalParticipantIds = order;
              else if (slot.leagueGroupId) {
                configGroups[slot.leagueGroupId] = {
                  ...configGroups[slot.leagueGroupId],
                  participantIds: order,
                };
              }
            }
          } else if (slot.slotKind === BracketSlotKind.MAIN && slot.roundIndex === 0) {
            const seeds = planMainR0Seeds(bracketSize, slot, groupSlots);
            if (seeds) {
              order[seeds.seedA - 1] = gameUpdate.participantA;
              order[seeds.seedB - 1] = gameUpdate.participantB;
              if (isCross) globalParticipantIds = order;
              else if (slot.leagueGroupId) {
                configGroups[slot.leagueGroupId] = {
                  ...configGroups[slot.leagueGroupId],
                  participantIds: order,
                };
              }
            }
          }
        }
      }

      const touchedTrees = new Set<string | null>([
        ...slots.map((s) => treeKey(s)),
        ...gameTeamUpdates
          .map((g) => {
            const s = round.bracketSlots.find((x) => x.gameId === g.gameId);
            return s ? treeKey(s) : null;
          })
          .filter((k): k is string | null => k !== undefined),
      ]);
      for (const treeId of touchedTrees) {
        const ids = await BracketAdvancementService.tryCreateReadyGames(round.id, treeId, tx);
        createdGameIds.push(...ids);
      }

      const prevAudit = config?.audit ?? [];
      const nextConfig: BracketConfigShape = {
        ...(config ?? {}),
        groups: configGroups,
        globalParticipantIds: isCross ? globalParticipantIds : config?.globalParticipantIds,
        audit: prevAudit,
      };
      if (auditChanges.length > 0) {
        const entry: BracketAuditEntry = {
          userId,
          timestamp: new Date().toISOString(),
          changes: auditChanges,
        };
        nextConfig.audit = [...prevAudit, entry];
      }
      await tx.leagueRound.update({
        where: { id: round.id },
        data: { bracketConfig: nextConfig as Prisma.InputJsonValue },
      });
    });

    BracketGameNotificationService.notifyCreatedGames(createdGameIds);

    return this.getBracketPlayoff(leagueSeasonId, userId, {
      roundId: round.id,
    });
  }

  static async notifyBracketSummary(
    leagueSeasonId: string,
    userId: string,
    opts?: { roundId?: string; leagueGroupId?: string }
  ) {
    const { BracketRoundSummaryService } = await import('./bracketRoundSummary.service');
    return BracketRoundSummaryService.notifyBracketSummaryManual(leagueSeasonId, userId, opts);
  }

  static async applySlotWalkover(
    leagueSeasonId: string,
    slotId: string,
    userId: string,
    payload: { leagueParticipantId: string; skipGameFinal?: boolean }
  ) {
    const { BracketSlotWalkoverService } = await import('./bracketSlotWalkover.service');
    return BracketSlotWalkoverService.applyWalkover(leagueSeasonId, slotId, userId, payload);
  }
}

type BracketAuditEntry = {
  userId: string;
  timestamp: string;
  changes: Array<{
    slotId: string;
    before: {
      leagueParticipantId?: string | null;
      side?: 'A' | 'B';
      gameId?: string;
    };
    after: {
      leagueParticipantId?: string | null;
      side?: 'A' | 'B';
      gameId?: string;
      participantA?: string;
      participantB?: string;
    };
  }>;
};

function planMainR0Seeds(
  bracketSize: number,
  slot: { slotKind: BracketSlotKind; roundIndex: number; matchIndex: number; id: string },
  groupSlots: Array<{ slotKind: BracketSlotKind; roundIndex: number; matchIndex: number; id: string }>
): { seedA: number; seedB: number } | null {
  if (slot.slotKind !== BracketSlotKind.MAIN || slot.roundIndex !== 0) return null;
  const mainR0 = groupSlots
    .filter((s) => s.slotKind === BracketSlotKind.MAIN && s.roundIndex === 0)
    .sort((a, b) => a.matchIndex - b.matchIndex);
  const idx = mainR0.findIndex((s) => s.id === slot.id);
  if (idx < 0) return null;
  const pairings = mainFirstRoundPairings(bracketSize);
  const pair = pairings[idx];
  if (!pair) return null;
  return { seedA: pair[0], seedB: pair[1] };
}

function roundLabelForSlot(slot: SlotRow, bracketSize: number, groupSlots?: SlotRow[]): string {
  if (slot.slotKind === BracketSlotKind.BYE) return 'Bye';
  if (slot.slotKind === BracketSlotKind.PLAY_IN) return 'Play-in';
  if (slot.slotKind === BracketSlotKind.THIRD_PLACE) return 'Third place';
  if (slot.slotKind === BracketSlotKind.CONSOLATION) {
    const consR0 = (groupSlots ?? []).filter(
      (s) => s.slotKind === BracketSlotKind.CONSOLATION && s.roundIndex === 0
    ).length;
    return consolationRoundLabel(consR0 * 2, slot.roundIndex);
  }
  if (slot.slotKind === BracketSlotKind.LOSERS) {
    const losR0 = (groupSlots ?? []).filter(
      (s) => s.slotKind === BracketSlotKind.LOSERS && s.roundIndex === 0
    ).length;
    return losersRoundLabel(losR0 * 2, slot.roundIndex);
  }
  if (slot.slotKind === BracketSlotKind.GRAND_FINAL) return 'Grand final';
  return mainRoundLabel(bracketSize, slot.roundIndex);
}
