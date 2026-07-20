import {
  EntityType,
  LeagueParticipantType,
  ParticipantStatus,
  Prisma,
  ResultsStatus,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { LEAGUE_USER_SELECT, projectLeagueParticipants } from './leagueSportProjection.util';
import { loadLeagueSeasonSportOrThrow } from '../../utils/validators/validateLeagueSeasonSport';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import { rostersEqual, sortedPlayerKey } from './leagueParticipantResolve';
import { upsertRosterAlias, assertNewRosterNotForeignAlias } from './leagueTeamRosterAlias.util';

export type SwapLeagueTeamPlayerParams = {
  leagueSeasonId: string;
  participantId: string;
  outUserId: string;
  inUserId: string;
};

function gameTeamIncludesOutAndStaying(
  playerIds: string[],
  outUserId: string,
  stayingUserIds: string[],
): boolean {
  if (!playerIds.includes(outUserId)) return false;
  return stayingUserIds.every((id) => playerIds.includes(id));
}

function shouldPreserveHistoricalRoster(game: {
  resultsStatus: ResultsStatus;
  _count: { outcomes: number };
}): boolean {
  // Any scored game must keep who actually played — ratings + standings replay depend on it.
  if (game._count.outcomes > 0) return true;
  if (game.resultsStatus === ResultsStatus.FINAL) return true;
  if (game.resultsStatus === ResultsStatus.IN_PROGRESS) return true;
  return false;
}

async function ensurePlayingParticipant(
  tx: Prisma.TransactionClient,
  gameId: string,
  userId: string,
): Promise<void> {
  const existing = await tx.gameParticipant.findFirst({
    where: { gameId, userId },
  });
  if (!existing) {
    await tx.gameParticipant.create({
      data: {
        gameId,
        userId,
        role: 'PARTICIPANT',
        status: ParticipantStatus.PLAYING,
      },
    });
    return;
  }
  if (existing.status !== ParticipantStatus.PLAYING) {
    await tx.gameParticipant.update({
      where: { id: existing.id },
      data: { status: ParticipantStatus.PLAYING },
    });
  }
}

async function replacePlayerOnGameTeam(
  tx: Prisma.TransactionClient,
  gameTeamId: string,
  outUserId: string,
  inUserId: string,
): Promise<void> {
  const players = await tx.gameTeamPlayer.findMany({
    where: { gameTeamId },
    select: { id: true, userId: true },
  });
  if (!players.some((p) => p.userId === outUserId)) return;
  if (players.some((p) => p.userId === inUserId)) {
    await tx.gameTeamPlayer.deleteMany({ where: { gameTeamId, userId: outUserId } });
    return;
  }
  const outRow = players.find((p) => p.userId === outUserId);
  if (!outRow) return;
  await tx.gameTeamPlayer.update({
    where: { id: outRow.id },
    data: { userId: inUserId },
  });
}

async function userStillOnAnySeasonTeam(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  userId: string,
): Promise<boolean> {
  const teams = await tx.leagueParticipant.findMany({
    where: {
      leagueSeasonId,
      participantType: LeagueParticipantType.TEAM,
    },
    select: {
      leagueTeam: {
        select: { players: { select: { userId: true } } },
      },
    },
  });
  return teams.some((t) => t.leagueTeam?.players.some((p) => p.userId === userId));
}

export class LeagueTeamPlayerSwapService {
  static async swapPlayer(params: SwapLeagueTeamPlayerParams) {
    const { leagueSeasonId, participantId, outUserId, inUserId } = params;

    if (!outUserId || !inUserId) {
      throw new ApiError(400, 'Both players are required for a swap');
    }
    if (outUserId === inUserId) {
      throw new ApiError(400, 'Cannot swap a player with themselves');
    }

    const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${leagueSeasonId}::text))`);

      const seasonGame = await tx.game.findUnique({
        where: { id: leagueSeasonId },
        select: {
          id: true,
          hasFixedTeams: true,
          allowUserInMultipleTeams: true,
          entityType: true,
        },
      });

      if (!seasonGame || seasonGame.entityType !== EntityType.LEAGUE_SEASON) {
        throw new ApiError(404, 'League season not found');
      }
      if (!seasonGame.hasFixedTeams) {
        throw new ApiError(400, 'Player swap requires fixed teams');
      }

      const participant = await tx.leagueParticipant.findFirst({
        where: {
          id: participantId,
          leagueSeasonId,
          participantType: LeagueParticipantType.TEAM,
        },
        include: {
          leagueTeam: {
            include: { players: true },
          },
        },
      });

      if (!participant?.leagueTeam) {
        throw new ApiError(404, 'Fixed team not found');
      }

      const oldPlayerIds = participant.leagueTeam.players.map((p) => p.userId);
      if (oldPlayerIds.length !== 2) {
        throw new ApiError(400, 'League team roster must contain exactly two players');
      }
      if (!oldPlayerIds.includes(outUserId)) {
        throw new ApiError(400, 'Selected player is not on this team');
      }
      if (oldPlayerIds.includes(inUserId)) {
        throw new ApiError(400, 'Replacement is already on this team');
      }

      const stayingUserIds = oldPlayerIds.filter((id) => id !== outUserId);
      const newPlayerIds = [...stayingUserIds, inUserId].sort();
      const oldRosterKey = sortedPlayerKey(oldPlayerIds);
      const newRosterKey = sortedPlayerKey(newPlayerIds);

      const seasonParticipants = await tx.leagueParticipant.findMany({
        where: {
          leagueSeasonId,
          participantType: LeagueParticipantType.TEAM,
        },
        include: {
          leagueTeam: { include: { players: { select: { userId: true } } } },
        },
      });

      for (const other of seasonParticipants) {
        if (other.id === participant.id || !other.leagueTeam) continue;
        const otherIds = other.leagueTeam.players.map((p) => p.userId);
        if (rostersEqual(otherIds, newPlayerIds)) {
          throw new ApiError(400, 'Another team already has this roster');
        }
      }

      if (!seasonGame.allowUserInMultipleTeams) {
        const alreadyOnOtherTeam = seasonParticipants.some((other) => {
          if (other.id === participant.id || !other.leagueTeam) return false;
          return other.leagueTeam.players.some((p) => p.userId === inUserId);
        });
        if (alreadyOnOtherTeam) {
          throw new ApiError(400, 'Player is already on another team');
        }
      }

      await assertNewRosterNotForeignAlias(tx, {
        leagueSeasonId,
        newPlayerIds,
        allowedLeagueTeamIds: [participant.leagueTeamId!],
      });

      const inUser = await tx.user.findUnique({
        where: { id: inUserId },
        select: { id: true },
      });
      if (!inUser) {
        throw new ApiError(404, 'Replacement player not found');
      }

      const sharedElsewhere = await tx.leagueParticipant.count({
        where: {
          leagueTeamId: participant.leagueTeamId!,
          leagueSeasonId: { not: leagueSeasonId },
        },
      });

      const previousTeamId = participant.leagueTeamId!;
      let franchiseTeamId = previousTeamId;

      if (sharedElsewhere > 0) {
        const created = await tx.leagueTeam.create({
          data: {
            players: {
              create: newPlayerIds.map((userId) => ({ userId })),
            },
          },
        });
        franchiseTeamId = created.id;
        await tx.leagueParticipant.update({
          where: { id: participant.id },
          data: { leagueTeamId: franchiseTeamId },
        });
      } else {
        const outMembership = participant.leagueTeam.players.find((p) => p.userId === outUserId);
        if (!outMembership) {
          throw new ApiError(400, 'Selected player is not on this team');
        }
        await tx.leagueTeamPlayer.update({
          where: { id: outMembership.id },
          data: { userId: inUserId },
        });
      }

      if (franchiseTeamId !== previousTeamId) {
        await tx.leagueTeamRosterAlias.updateMany({
          where: {
            leagueSeasonId,
            leagueTeamId: previousTeamId,
          },
          data: { leagueTeamId: franchiseTeamId },
        });
      }

      await upsertRosterAlias(tx, {
        leagueSeasonId,
        leagueTeamId: franchiseTeamId,
        teamPlayerIds: oldPlayerIds,
      });

      await ensurePlayingParticipant(tx, leagueSeasonId, inUserId);

      const seasonTeams = await tx.gameTeam.findMany({
        where: { gameId: leagueSeasonId },
        include: { players: { select: { userId: true } } },
      });
      for (const gt of seasonTeams) {
        const ids = gt.players.map((p) => p.userId);
        if (
          rostersEqual(ids, oldPlayerIds) ||
          gameTeamIncludesOutAndStaying(ids, outUserId, stayingUserIds)
        ) {
          await replacePlayerOnGameTeam(tx, gt.id, outUserId, inUserId);
        }
      }

      const fixtureGames = await tx.game.findMany({
        where: {
          entityType: EntityType.LEAGUE,
          parentId: leagueSeasonId,
          hasFixedTeams: true,
        },
        select: {
          id: true,
          resultsStatus: true,
          _count: { select: { outcomes: true } },
          fixedTeams: {
            select: {
              id: true,
              players: { select: { userId: true } },
            },
          },
        },
      });

      for (const fixture of fixtureGames) {
        const matchingTeams = fixture.fixedTeams.filter((ft) => {
          const ids = ft.players.map((p) => p.userId);
          return (
            rostersEqual(ids, oldPlayerIds) ||
            gameTeamIncludesOutAndStaying(ids, outUserId, stayingUserIds)
          );
        });
        if (matchingTeams.length === 0) continue;

        if (shouldPreserveHistoricalRoster(fixture)) {
          continue;
        }

        // Re-check under row lock — scoring may have started since the snapshot above.
        await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${fixture.id} FOR UPDATE`);
        const live = await tx.game.findUnique({
          where: { id: fixture.id },
          select: {
            resultsStatus: true,
            _count: { select: { outcomes: true } },
            fixedTeams: {
              select: {
                id: true,
                players: { select: { userId: true } },
              },
            },
          },
        });
        if (!live || shouldPreserveHistoricalRoster(live)) {
          continue;
        }

        const liveMatching = live.fixedTeams.filter((ft) => {
          const ids = ft.players.map((p) => p.userId);
          return (
            rostersEqual(ids, oldPlayerIds) ||
            gameTeamIncludesOutAndStaying(ids, outUserId, stayingUserIds)
          );
        });
        if (liveMatching.length === 0) continue;

        await ensurePlayingParticipant(tx, fixture.id, inUserId);
        for (const gt of liveMatching) {
          await replacePlayerOnGameTeam(tx, gt.id, outUserId, inUserId);
        }

        const outStillOnFixture = await tx.gameTeamPlayer.findFirst({
          where: {
            userId: outUserId,
            gameTeam: { gameId: fixture.id },
          },
          select: { id: true },
        });
        if (!outStillOnFixture) {
          await tx.gameParticipant.updateMany({
            where: {
              gameId: fixture.id,
              userId: outUserId,
              status: ParticipantStatus.PLAYING,
              role: 'PARTICIPANT',
            },
            data: { status: ParticipantStatus.NON_PLAYING },
          });
        }
      }

      const outStillOnSeasonTeam = await userStillOnAnySeasonTeam(tx, leagueSeasonId, outUserId);
      if (!outStillOnSeasonTeam) {
        const outOnSeasonHubTeam = await tx.gameTeamPlayer.findFirst({
          where: {
            userId: outUserId,
            gameTeam: { gameId: leagueSeasonId },
          },
          select: { id: true },
        });
        if (!outOnSeasonHubTeam) {
          await tx.gameParticipant.updateMany({
            where: {
              gameId: leagueSeasonId,
              userId: outUserId,
              status: ParticipantStatus.PLAYING,
              role: 'PARTICIPANT',
            },
            data: { status: ParticipantStatus.NON_PLAYING },
          });
        }
      }

      const updated = await tx.leagueParticipant.findUnique({
        where: { id: participant.id },
        include: {
          user: { select: LEAGUE_USER_SELECT },
          leagueTeam: {
            include: {
              players: {
                include: { user: { select: LEAGUE_USER_SELECT } },
              },
            },
          },
          currentGroup: {
            select: { id: true, name: true, color: true },
          },
        },
      });

      if (!updated) {
        throw new ApiError(500, 'Player swap failed');
      }

      return {
        participant: projectLeagueParticipants([updated], seasonSport)[0],
        previousRosterKey: oldRosterKey,
        currentRosterKey: newRosterKey,
        franchiseTeamId,
      };
    });

    return result;
  }

  static async listSwapCandidates(params: {
    leagueSeasonId: string;
    participantId: string;
    outUserId: string;
  }) {
    const { leagueSeasonId, participantId, outUserId } = params;
    const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId);

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeasonId },
      select: {
        allowUserInMultipleTeams: true,
        hasFixedTeams: true,
        participants: {
          where: {
            status: { in: [ParticipantStatus.PLAYING, ParticipantStatus.NON_PLAYING] },
          },
          include: { user: { select: LEAGUE_USER_SELECT } },
        },
      },
    });

    if (!seasonGame?.hasFixedTeams) {
      throw new ApiError(400, 'Player swap requires fixed teams');
    }

    const participant = await prisma.leagueParticipant.findFirst({
      where: {
        id: participantId,
        leagueSeasonId,
        participantType: LeagueParticipantType.TEAM,
      },
      include: {
        leagueTeam: { include: { players: { select: { userId: true } } } },
      },
    });

    if (!participant?.leagueTeam) {
      throw new ApiError(404, 'Fixed team not found');
    }

    const rosterIds = new Set(participant.leagueTeam.players.map((p) => p.userId));
    if (!rosterIds.has(outUserId)) {
      throw new ApiError(400, 'Selected player is not on this team');
    }

    const usersOnAnyTeam = new Set<string>();
    if (!seasonGame.allowUserInMultipleTeams) {
      const allTeams = await prisma.leagueParticipant.findMany({
        where: {
          leagueSeasonId,
          participantType: LeagueParticipantType.TEAM,
        },
        select: {
          leagueTeam: { select: { players: { select: { userId: true } } } },
        },
      });
      for (const t of allTeams) {
        for (const p of t.leagueTeam?.players ?? []) {
          usersOnAnyTeam.add(p.userId);
        }
      }
    }

    const candidates = seasonGame.participants
      .filter((p) => {
        if (!p.user) return false;
        if (p.userId === outUserId) return false;
        if (rosterIds.has(p.userId)) return false;
        if (!seasonGame.allowUserInMultipleTeams && usersOnAnyTeam.has(p.userId)) return false;
        return true;
      })
      .map((p) => p.user!);

    return {
      allowUserInMultipleTeams: seasonGame.allowUserInMultipleTeams,
      candidates: candidates.map((u) => projectUserForSportContext(u as any, seasonSport)),
    };
  }
}
