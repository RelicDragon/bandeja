/**
 * QA: TeamForRoundGeneration (fixed-teams league rounds). Run:
 *   DB_URL=... npx ts-node scripts/qa-leagueRoundGeneration.ts
 */
import {
  ChatContextType,
  EntityType,
  LeagueParticipantType,
  MessageState,
  ParticipantRole,
  ResultsStatus,
  RoundType,
  type PrismaClient,
} from '@prisma/client';
import { TeamForRoundGeneration } from '../src/services/league/generation/TeamForRoundGeneration';
import { matchupKeyFromSigs, teamPlayerSig } from '../src/services/league/generation/fixedTeamsRoundMatching';
import { LeagueCreateService } from '../src/services/league/create.service';
import { LeagueRecreateRegularSeasonService } from '../src/services/league/recreateRegularSeason.service';
import { roundsInSingleRoundRobinCycle } from '../src/services/league/generation/fixedTeamsRoundRobin';

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) {
    throw new Error('Set DB_URL (e.g. postgresql://user:pass@host:5432/db?schema=padelpulse)');
  }
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

async function cleanupLeagueBranch(
  prisma: PrismaClient,
  leagueId: string,
  seasonGameId: string,
) {
  const rounds = await prisma.leagueRound.findMany({
    where: { leagueSeasonId: seasonGameId },
    select: { id: true },
  });
  for (const r of rounds) {
    await prisma.game.deleteMany({ where: { leagueRoundId: r.id } });
  }
  await prisma.leagueRound.deleteMany({ where: { leagueSeasonId: seasonGameId } });
  await prisma.leagueGroup.deleteMany({ where: { leagueSeasonId: seasonGameId } });
  await prisma.game.delete({ where: { id: seasonGameId } }).catch(() => undefined);
  await prisma.league.delete({ where: { id: leagueId } }).catch(() => undefined);
}

function matchupKeyFromGameTeams(
  aUserIds: string[],
  bUserIds: string[],
): string {
  return matchupKeyFromSigs(teamPlayerSig(aUserIds), teamPlayerSig(bUserIds));
}

async function matchupKeysForRound(prisma: PrismaClient, leagueRoundId: string): Promise<string[]> {
  const games = await prisma.game.findMany({
    where: { leagueRoundId, entityType: EntityType.LEAGUE },
    include: {
      fixedTeams: {
        orderBy: { teamNumber: 'asc' },
        include: { players: { select: { userId: true } } },
      },
    },
  });
  const keys: string[] = [];
  for (const g of games) {
    if (g.fixedTeams.length < 2) continue;
    const p0 = g.fixedTeams[0].players.map((p) => p.userId).filter(Boolean);
    const p1 = g.fixedTeams[1].players.map((p) => p.userId).filter(Boolean);
    if (p0.length !== 2 || p1.length !== 2) continue;
    keys.push(matchupKeyFromGameTeams(p0, p1));
  }
  return keys;
}

async function assignAllTeamParticipantsToGroup(
  prisma: PrismaClient,
  seasonId: string,
  groupId: string,
) {
  await prisma.leagueParticipant.updateMany({
    where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
    data: { currentGroupId: groupId },
  });
}

type Branch = { leagueId: string; seasonId: string };

async function createFixedTeamLeague(
  prisma: PrismaClient,
  cityId: string,
  teamRosters: string[][],
  allowUserInMultipleTeams: boolean,
  start: Date,
  end: Date,
): Promise<Branch> {
  const userIds = [...new Set(teamRosters.flat())];
  if (userIds.length !== teamRosters.flat().length) {
    throw new Error('createFixedTeamLeague: each user must appear once (disjoint rosters)');
  }

  const league = await prisma.league.create({
    data: {
      name: `QA league round gen ${Date.now()}`,
      cityId,
      hasFixedTeams: true,
    },
  });

  const seasonGameRow = await prisma.game.create({
    data: {
      entityType: EntityType.LEAGUE_SEASON,
      gameType: 'CLASSIC',
      cityId,
      startTime: start,
      endTime: end,
      maxParticipants: 4,
      minParticipants: 2,
      hasFixedTeams: true,
      allowUserInMultipleTeams,
      timeIsSet: true,
      participants: {
        create: userIds.map((userId, i) => ({
          userId,
          role: i === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
        })),
      },
      fixedTeams: {
        create: teamRosters.map((pair, idx) => ({
          teamNumber: idx + 1,
          players: { create: pair.map((userId) => ({ userId })) },
        })),
      },
    },
  });

  await prisma.leagueSeason.create({
    data: {
      id: seasonGameRow.id,
      leagueId: league.id,
      orderIndex: 0,
    },
  });

  return { leagueId: league.id, seasonId: seasonGameRow.id };
}

/** `teamCount` disjoint pairs from `userRow` in order. */
function buildDisjointTeams(userRow: { id: string }[], teamCount: number): string[][] {
  const need = teamCount * 2;
  if (userRow.length < need) {
    throw new Error(`buildDisjointTeams: need ${need} users for ${teamCount} teams, have ${userRow.length}`);
  }
  const teams: string[][] = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push([userRow[i * 2]!.id, userRow[i * 2 + 1]!.id]);
  }
  return teams;
}

async function assertFullSingleRoundRobin(
  prisma: PrismaClient,
  label: string,
  teamCount: number,
  seasonId: string,
) {
  const n = teamCount;
  const roundsNeeded = n % 2 === 0 ? n - 1 : n;
  const gamesPerRound = Math.floor(n / 2);
  const expectedUniquePairings = (n * (n - 1)) / 2;

  const allKeys = new Set<string>();
  for (let o = 0; o < roundsNeeded; o++) {
    const round = await prisma.leagueRound.create({
      data: { leagueSeasonId: seasonId, orderIndex: o, roundType: RoundType.REGULAR },
    });
    await TeamForRoundGeneration.generateGamesForRound(round.id);
    const keys = await matchupKeysForRound(prisma, round.id);
    if (keys.length !== gamesPerRound) {
      throw new Error(`${label} round ${o}: expected ${gamesPerRound} games, got ${keys.length}`);
    }
    for (const k of keys) {
      if (allKeys.has(k)) {
        throw new Error(`${label}: duplicate matchup ${k} across rounds (round index ${o})`);
      }
      allKeys.add(k);
    }
  }
  if (allKeys.size !== expectedUniquePairings) {
    throw new Error(`${label}: expected ${expectedUniquePairings} unique pairings, got ${allKeys.size}`);
  }
  await assertFixedTeamRoundRobinScheduleBalance(prisma, label, seasonId, n, roundsNeeded);
  console.log(`ok: ${label} — ${n} teams, ${roundsNeeded} rounds, ${allKeys.size} distinct matchups`);
}

/** Per-team games = n−1; each REGULAR round: even n → everyone plays once; odd n → exactly one bye. */
async function assertFixedTeamRoundRobinScheduleBalance(
  prisma: PrismaClient,
  label: string,
  seasonId: string,
  n: number,
  roundsNeeded: number,
  groupId?: string,
) {
  const group =
    groupId != null
      ? await prisma.leagueGroup.findFirst({
          where: { id: groupId, leagueSeasonId: seasonId },
        })
      : await prisma.leagueGroup.findFirst({ where: { leagueSeasonId: seasonId } });
  if (!group) {
    throw new Error(`${label}: schedule balance — no LeagueGroup`);
  }

  const participants = await prisma.leagueParticipant.findMany({
    where: {
      leagueSeasonId: seasonId,
      participantType: LeagueParticipantType.TEAM,
      currentGroupId: group.id,
    },
    include: {
      leagueTeam: { include: { players: { select: { userId: true } } } },
    },
  });
  if (participants.length !== n) {
    throw new Error(
      `${label}: schedule balance — expected ${n} team participants in group, got ${participants.length}`,
    );
  }

  const rosterSigToLeagueTeamId = new Map<string, string>();
  for (const p of participants) {
    const ids = (p.leagueTeam?.players ?? []).map((x) => x.userId).filter(Boolean) as string[];
    if (ids.length !== 2) {
      throw new Error(`${label}: schedule balance — bad roster on participant ${p.id}`);
    }
    rosterSigToLeagueTeamId.set(teamPlayerSig(ids), p.leagueTeamId!);
  }

  const games = await prisma.game.findMany({
    where: {
      parentId: seasonId,
      entityType: EntityType.LEAGUE,
      leagueGroupId: group.id,
    },
    include: {
      leagueRound: { select: { orderIndex: true, roundType: true } },
      fixedTeams: {
        orderBy: { teamNumber: 'asc' },
        include: { players: { select: { userId: true } } },
      },
    },
  });

  const regularGames = games.filter((g) => g.leagueRound?.roundType === RoundType.REGULAR);
  const expectedGameRows = roundsNeeded * Math.floor(n / 2);
  if (regularGames.length !== expectedGameRows) {
    throw new Error(
      `${label}: schedule balance — expected ${expectedGameRows} REGULAR league games, got ${regularGames.length}`,
    );
  }

  const gamesPerLeagueTeam = new Map<string, number>();
  for (const tid of rosterSigToLeagueTeamId.values()) {
    gamesPerLeagueTeam.set(tid, 0);
  }

  const appearancesByRound = new Map<number, Map<string, number>>();

  for (const g of regularGames) {
    const r = g.leagueRound!.orderIndex;
    if (r < 0 || r >= roundsNeeded) {
      throw new Error(`${label}: schedule balance — game ${g.id} has round orderIndex ${r} outside 0..${roundsNeeded - 1}`);
    }
    if (!appearancesByRound.has(r)) {
      appearancesByRound.set(r, new Map());
    }
    const roundMap = appearancesByRound.get(r)!;

    if (g.fixedTeams.length < 2) {
      throw new Error(`${label}: schedule balance — game ${g.id} missing fixed teams`);
    }
    for (const ft of g.fixedTeams) {
      const ids = ft.players.map((p) => p.userId).filter(Boolean) as string[];
      if (ids.length !== 2) {
        throw new Error(`${label}: schedule balance — game ${g.id} bad roster`);
      }
      const leagueTeamId = rosterSigToLeagueTeamId.get(teamPlayerSig(ids));
      if (!leagueTeamId) {
        throw new Error(`${label}: schedule balance — unknown roster in game ${g.id}`);
      }
      gamesPerLeagueTeam.set(leagueTeamId, (gamesPerLeagueTeam.get(leagueTeamId) ?? 0) + 1);
      roundMap.set(leagueTeamId, (roundMap.get(leagueTeamId) ?? 0) + 1);
    }
  }

  const expectedPerTeam = n - 1;
  for (const p of participants) {
    const tid = p.leagueTeamId!;
    const c = gamesPerLeagueTeam.get(tid) ?? 0;
    if (c !== expectedPerTeam) {
      throw new Error(
        `${label}: schedule balance — leagueTeam ${tid} played ${c} games, expected ${expectedPerTeam} for each team`,
      );
    }
  }

  for (let r = 0; r < roundsNeeded; r++) {
    const roundMap = appearancesByRound.get(r);
    if (!roundMap) {
      throw new Error(`${label}: schedule balance — no games for round orderIndex ${r}`);
    }
    let byes = 0;
    for (const p of participants) {
      const tid = p.leagueTeamId!;
      const appearances = roundMap.get(tid) ?? 0;
      if (appearances > 1) {
        throw new Error(
          `${label}: schedule balance — leagueTeam ${tid} appears ${appearances}x in round ${r}`,
        );
      }
      if (appearances === 0) {
        byes++;
      }
    }
    if (n % 2 === 0 && byes !== 0) {
      throw new Error(`${label}: schedule balance — round ${r}: even n expects 0 byes, got ${byes}`);
    }
    if (n % 2 === 1 && byes !== 1) {
      throw new Error(`${label}: schedule balance — round ${r}: odd n expects exactly 1 bye, got ${byes}`);
    }
  }
}

async function main() {
  ensureDbUrl();
  const { default: prisma } = await import('../src/config/database');
  const { LeagueSyncService } = await import('../src/services/league/sync.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({ take: 50, select: { id: true }, orderBy: { id: 'asc' } });
  if (users.length < 48) throw new Error('need at least 48 User rows (for 24-team league QA)');

  const uid = (i: number) => users[i]!.id;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 7_200_000);
  const branches: Branch[] = [];

  try {
    // --- 1) Pure round-robin: 4 teams, 3 rounds → 6 distinct pairings ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr4 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const allKeys = new Set<string>();
      for (let o = 0; o < 3; o++) {
        const round = await prisma.leagueRound.create({
          data: { leagueSeasonId: seasonId, orderIndex: o, roundType: RoundType.REGULAR },
        });
        await TeamForRoundGeneration.generateGamesForRound(round.id);
        const keys = await matchupKeysForRound(prisma, round.id);
        if (keys.length !== 2) {
          throw new Error(`pure RR round ${o}: expected 2 games, got ${keys.length}`);
        }
        for (const k of keys) {
          if (allKeys.has(k)) throw new Error(`pure RR: duplicate matchup ${k} across rounds`);
          allKeys.add(k);
        }
      }
      if (allKeys.size !== 6) {
        throw new Error(`pure RR: expected 6 unique matchups, got ${allKeys.size}`);
      }
      await assertFixedTeamRoundRobinScheduleBalance(prisma, 'pure RR 4', seasonId, 4, 3, group.id);
      console.log('ok: pure round-robin 4 teams × 3 rounds → 6 distinct pairings');
    }

    // --- 2) PLAYOFF round does not count toward REGULAR slot ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA playoff ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const r0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r0.id);
      const k0 = (await matchupKeysForRound(prisma, r0.id)).sort().join(';');

      await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.PLAYOFF },
      });

      const r2 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 2, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r2.id);
      const keysAfterGap = await matchupKeysForRound(prisma, r2.id);

      const rAlt = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 3, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(rAlt.id);
      const keysAlt = await matchupKeysForRound(prisma, rAlt.id);

      const r1solo = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 4, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r1solo.id);
      const keysSolo = await matchupKeysForRound(prisma, r1solo.id);

      if (keysAfterGap.sort().join(';') === k0) {
        throw new Error('expected REGULAR after PLAYOFF to use slot 1, not repeat slot 0');
      }
      if (keysAlt.sort().join(';') === keysAfterGap.sort().join(';')) {
        throw new Error('expected different pairings for consecutive REGULAR rounds');
      }
      if (keysSolo.length !== 2) throw new Error('expected 2 games on third REGULAR round');
      console.log('ok: PLAYOFF round ignored for REGULAR RR slot indexing');
    }

    // --- 3) New team mid-season: 5th team plays exactly once this round (2 games, one bye) ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA add5 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const round0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(round0.id);

      await prisma.gameTeam.create({
        data: {
          gameId: seasonId,
          teamNumber: 5,
          players: { create: [{ userId: uid(8) }, { userId: uid(9) }] },
        },
      });
      await prisma.gameParticipant.create({
        data: { gameId: seasonId, userId: uid(8), role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
      });
      await prisma.gameParticipant.create({
        data: { gameId: seasonId, userId: uid(9), role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const newSig = teamPlayerSig([uid(8), uid(9)]);
      const round1 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(round1.id);
      const gamesR1 = await prisma.game.findMany({
        where: { leagueRoundId: round1.id, entityType: EntityType.LEAGUE },
        include: {
          fixedTeams: {
            orderBy: { teamNumber: 'asc' },
            include: { players: { select: { userId: true } } },
          },
        },
      });
      if (gamesR1.length !== 2) {
        throw new Error(`5 teams: expected 2 games (one bye), got ${gamesR1.length}`);
      }
      let newTeamSides = 0;
      for (const g of gamesR1) {
        for (const ft of g.fixedTeams) {
          const sig = teamPlayerSig(ft.players.map((p) => p.userId));
          if (sig === newSig) newTeamSides++;
        }
      }
      if (newTeamSides !== 1) {
        throw new Error('expected new team in exactly one match this round');
      }
      console.log('ok: fifth team joins — 2 matches, new team plays once (RR may repeat an R0 pairing)');
    }

    // --- 4) Drop team: continue with 3 teams ---
    {
      const teams = [
        [uid(0), uid(1)],
        [uid(2), uid(3)],
        [uid(4), uid(5)],
        [uid(6), uid(7)],
      ];
      const { leagueId, seasonId } = await createFixedTeamLeague(
        prisma,
        city.id,
        teams,
        false,
        start,
        end,
      );
      branches.push({ leagueId, seasonId });

      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA drop ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);

      const r0 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 0, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r0.id);
      const played = new Set(await matchupKeysForRound(prisma, r0.id));

      const dropUserPair = [uid(6), uid(7)].sort();
      const teamParts = await prisma.leagueParticipant.findMany({
        where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
        include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
      });
      const dropLp = teamParts.find((p) => {
        const ids = (p.leagueTeam?.players ?? []).map((x) => x.userId).sort();
        return ids.length === 2 && ids[0] === dropUserPair[0] && ids[1] === dropUserPair[1];
      });
      if (!dropLp?.leagueTeamId) throw new Error('drop-team: league participant not found');

      const gt4 = await prisma.gameTeam.findFirst({
        where: { gameId: seasonId, teamNumber: 4 },
      });
      if (gt4) {
        await prisma.gameTeamPlayer.deleteMany({ where: { gameTeamId: gt4.id } });
        await prisma.gameTeam.delete({ where: { id: gt4.id } });
      }
      await prisma.leagueParticipant.delete({ where: { id: dropLp.id } });
      await prisma.leagueTeam.delete({ where: { id: dropLp.leagueTeamId } });
      // Do not syncLeagueParticipants here: sync re-ingests teams from past round games and would resurrect the dropped team.

      const r1 = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 1, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(r1.id);
      const keys1 = await matchupKeysForRound(prisma, r1.id);
      if (keys1.length !== 1) throw new Error(`3 teams: expected 1 game, got ${keys1.length}`);
      if (played.has(keys1[0]!)) {
        throw new Error('drop team: should not repeat R0 matchup when other unplayed pairs exist among 3 teams');
      }
      console.log('ok: team removed — 3-team round generates 1 fresh matchup');
    }

    // --- 5) Full single RR: 11 teams (odd n — 11 rounds × 5 games, one bye per round, 10 games/team) ---
    {
      const teams = buildDisjointTeams(users, 11);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr11 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      await assertFullSingleRoundRobin(prisma, '11-team group', 11, seasonId);
    }

    // --- 6) Full single RR: 12 teams (11 rounds × 6 games = 66 pairings) ---
    {
      const teams = buildDisjointTeams(users, 12);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr12 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      await assertFullSingleRoundRobin(prisma, '12-team group', 12, seasonId);
    }

    // --- 7) Full single RR: 24 teams (23 rounds × 12 games = 276 pairings) ---
    {
      const teams = buildDisjointTeams(users, 24);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA rr24 ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      await assertFullSingleRoundRobin(prisma, '24-team group', 24, seasonId);
    }

    // --- 8) createFullRegularRoundRobin service (4 teams → 3 rounds, 6 games) ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA fullRR batch ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);
      const rc = await prisma.leagueRound.count({ where: { leagueSeasonId: seasonId } });
      const expectedRounds = roundsInSingleRoundRobinCycle(4);
      if (rc !== expectedRounds) {
        throw new Error(`full RR batch: expected ${expectedRounds} rounds, got ${rc}`);
      }
      const gc = await prisma.game.count({
        where: { parentId: seasonId, leagueGroupId: group.id, entityType: EntityType.LEAGUE },
      });
      if (gc !== 6) {
        throw new Error(`full RR batch: expected 6 games, got ${gc}`);
      }
      await assertFixedTeamRoundRobinScheduleBalance(prisma, 'full RR batch', seasonId, 4, 3, group.id);
      console.log('ok: createFullRegularRoundRobin — 4 teams, 3 rounds, 6 games');
    }

    // --- 9) createFullRegularRoundRobin: two groups (4 + 3 teams) → max cycle 3 rounds, 9 games ---
    {
      const teams = buildDisjointTeams(users, 7);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const groupA = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA fullRR m4x3 A ${Date.now()}` },
      });
      const groupB = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA fullRR m4x3 B ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      const teamParts = await prisma.leagueParticipant.findMany({
        where: { leagueSeasonId: seasonId, participantType: LeagueParticipantType.TEAM },
        include: { leagueTeam: { include: { players: { select: { userId: true } } } } },
      });
      if (teamParts.length !== 7) {
        throw new Error(`full RR mixed 4+3: expected 7 team participants, got ${teamParts.length}`);
      }
      const orderedIds = teams.map((pair) => {
        const want = new Set(pair);
        const p = teamParts.find((lp) => {
          const ids = (lp.leagueTeam?.players ?? []).map((x) => x.userId).filter(Boolean) as string[];
          return ids.length === 2 && ids.every((u) => want.has(u));
        });
        if (!p) throw new Error('full RR mixed 4+3: roster participant not found');
        return p.id;
      });
      const idsA = orderedIds.slice(0, 4);
      const idsB = orderedIds.slice(4);
      await prisma.leagueParticipant.updateMany({
        where: { id: { in: idsA } },
        data: { currentGroupId: groupA.id },
      });
      await prisma.leagueParticipant.updateMany({
        where: { id: { in: idsB } },
        data: { currentGroupId: groupB.id },
      });

      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);
      const rc = await prisma.leagueRound.count({ where: { leagueSeasonId: seasonId } });
      const expectedRounds = Math.max(
        roundsInSingleRoundRobinCycle(4),
        roundsInSingleRoundRobinCycle(3),
      );
      if (rc !== expectedRounds) {
        throw new Error(`full RR mixed 4+3: expected ${expectedRounds} rounds, got ${rc}`);
      }
      const gc = await prisma.game.count({
        where: { parentId: seasonId, entityType: EntityType.LEAGUE },
      });
      if (gc !== 9) {
        throw new Error(`full RR mixed 4+3: expected 9 games, got ${gc}`);
      }
      const rrRounds = Math.max(roundsInSingleRoundRobinCycle(4), roundsInSingleRoundRobinCycle(3));
      await assertFixedTeamRoundRobinScheduleBalance(prisma, 'full RR mixed group A', seasonId, 4, rrRounds, groupA.id);
      await assertFixedTeamRoundRobinScheduleBalance(prisma, 'full RR mixed group B', seasonId, 3, rrRounds, groupB.id);
      console.log('ok: createFullRegularRoundRobin — mixed 4+3 teams, two groups');
    }

    // --- 10) recreate: trims extra REGULAR round and refills to single RR (4 teams) ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA recreate trim ${Date.now()}` },
      });
      const { LeagueSyncService } = await import('../src/services/league/sync.service');
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);

      const extraRound = await prisma.leagueRound.create({
        data: { leagueSeasonId: seasonId, orderIndex: 99, roundType: RoundType.REGULAR },
      });
      await TeamForRoundGeneration.generateGamesForRound(extraRound.id);

      const beforeRounds = await prisma.leagueRound.count({
        where: { leagueSeasonId: seasonId, roundType: RoundType.REGULAR },
      });
      if (beforeRounds !== 4) {
        throw new Error(`recreate trim: expected 4 regular rounds before recreate, got ${beforeRounds}`);
      }

      await LeagueRecreateRegularSeasonService.recreateFullRegularRoundRobin(seasonId, ownerId);

      const afterRounds = await prisma.leagueRound.count({
        where: { leagueSeasonId: seasonId, roundType: RoundType.REGULAR },
      });
      const expectedRounds = roundsInSingleRoundRobinCycle(4);
      if (afterRounds !== expectedRounds) {
        throw new Error(`recreate trim: expected ${expectedRounds} rounds after, got ${afterRounds}`);
      }
      const gc = await prisma.game.count({
        where: { parentId: seasonId, leagueGroupId: group.id, entityType: EntityType.LEAGUE },
      });
      if (gc !== 6) {
        throw new Error(`recreate trim: expected 6 games after, got ${gc}`);
      }
      await assertFixedTeamRoundRobinScheduleBalance(
        prisma,
        'recreate trim',
        seasonId,
        4,
        expectedRounds,
        group.id
      );
      console.log('ok: recreateFullRegularRoundRobin — trims extra round, 4 teams × 3 rounds');
    }

    // --- 11) recreate: keeps fixture with user chat message ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA recreate chat ${Date.now()}` },
      });
      const { LeagueSyncService } = await import('../src/services/league/sync.service');
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);

      const stub = await prisma.game.findFirst({
        where: {
          parentId: seasonId,
          entityType: EntityType.LEAGUE,
          resultsStatus: 'NONE',
          timeIsSet: false,
          clubId: null,
        },
        select: { id: true },
      });
      if (!stub) {
        throw new Error('recreate chat: no unscheduled stub game found');
      }

      await prisma.chatMessage.create({
        data: {
          chatContextType: ChatContextType.GAME,
          contextId: stub.id,
          gameId: stub.id,
          senderId: ownerId,
          content: 'qa recreate chat guard',
          chatType: 'PUBLIC',
          state: MessageState.SENT,
        },
      });

      const res = await LeagueRecreateRegularSeasonService.recreateFullRegularRoundRobin(seasonId, ownerId);
      if (res.gamesPreservedDueToChat < 1) {
        throw new Error(`recreate chat: expected gamesPreservedDueToChat >= 1, got ${res.gamesPreservedDueToChat}`);
      }
      const still = await prisma.game.findUnique({ where: { id: stub.id } });
      if (!still) {
        throw new Error('recreate chat: stub game with chat was deleted');
      }
      console.log('ok: recreateFullRegularRoundRobin — preserves game with user chat');
    }

    async function findUnscheduledStub(seasonId: string) {
      return prisma.game.findFirst({
        where: {
          parentId: seasonId,
          entityType: EntityType.LEAGUE,
          resultsStatus: ResultsStatus.NONE,
          timeIsSet: false,
          clubId: null,
          courtId: null,
        },
        select: { id: true },
      });
    }

    // --- 12) recreate: keeps FINAL game ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA recreate final ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);

      const stub = await findUnscheduledStub(seasonId);
      if (!stub) throw new Error('recreate final: no stub game found');
      await prisma.game.update({
        where: { id: stub.id },
        data: { resultsStatus: ResultsStatus.FINAL },
      });

      const res = await LeagueRecreateRegularSeasonService.recreateFullRegularRoundRobin(seasonId, ownerId);
      if (res.gamesPreservedFinal < 1) {
        throw new Error(`recreate final: expected gamesPreservedFinal >= 1, got ${res.gamesPreservedFinal}`);
      }
      const still = await prisma.game.findUnique({ where: { id: stub.id } });
      if (!still || still.resultsStatus !== ResultsStatus.FINAL) {
        throw new Error('recreate final: FINAL game was deleted or changed');
      }
      console.log('ok: recreateFullRegularRoundRobin — preserves FINAL game');
    }

    // --- 13) recreate: keeps scheduled game (time + club) ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA recreate scheduled ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);

      const club = await prisma.club.findFirst({
        where: { cityId: city.id },
        select: { id: true },
      });
      if (!club) throw new Error('recreate scheduled: no club in city');

      const stub = await findUnscheduledStub(seasonId);
      if (!stub) throw new Error('recreate scheduled: no stub game found');
      await prisma.game.update({
        where: { id: stub.id },
        data: { timeIsSet: true, clubId: club.id, startTime: start },
      });

      const res = await LeagueRecreateRegularSeasonService.recreateFullRegularRoundRobin(seasonId, ownerId);
      if (res.gamesPreservedScheduled < 1) {
        throw new Error(
          `recreate scheduled: expected gamesPreservedScheduled >= 1, got ${res.gamesPreservedScheduled}`
        );
      }
      const still = await prisma.game.findUnique({ where: { id: stub.id } });
      if (!still || !still.timeIsSet || still.clubId !== club.id) {
        throw new Error('recreate scheduled: scheduled game was deleted or cleared');
      }
      console.log('ok: recreateFullRegularRoundRobin — preserves scheduled game');
    }

    // --- 14) recreate: keeps IN_PROGRESS game ---
    {
      const teams = buildDisjointTeams(users, 4);
      const { leagueId, seasonId } = await createFixedTeamLeague(prisma, city.id, teams, false, start, end);
      branches.push({ leagueId, seasonId });
      const group = await prisma.leagueGroup.create({
        data: { leagueSeasonId: seasonId, name: `QA recreate inprog ${Date.now()}` },
      });
      await LeagueSyncService.syncLeagueParticipants(seasonId);
      await assignAllTeamParticipantsToGroup(prisma, seasonId, group.id);
      const ownerId = teams[0][0];
      await LeagueCreateService.createFullRegularRoundRobin(seasonId, ownerId);

      const stub = await findUnscheduledStub(seasonId);
      if (!stub) throw new Error('recreate inprog: no stub game found');
      await prisma.game.update({
        where: { id: stub.id },
        data: { resultsStatus: ResultsStatus.IN_PROGRESS },
      });

      const res = await LeagueRecreateRegularSeasonService.recreateFullRegularRoundRobin(seasonId, ownerId);
      if (res.gamesPreservedInProgress < 1) {
        throw new Error(
          `recreate inprog: expected gamesPreservedInProgress >= 1, got ${res.gamesPreservedInProgress}`
        );
      }
      const still = await prisma.game.findUnique({ where: { id: stub.id } });
      if (!still || still.resultsStatus !== ResultsStatus.IN_PROGRESS) {
        throw new Error('recreate inprog: IN_PROGRESS game was deleted');
      }
      console.log('ok: recreateFullRegularRoundRobin — preserves IN_PROGRESS game');
    }

    console.log('qa-leagueRoundGeneration: all checks passed');
  } finally {
    for (const b of branches.reverse()) {
      await cleanupLeagueBranch(prisma, b.leagueId, b.seasonId);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
