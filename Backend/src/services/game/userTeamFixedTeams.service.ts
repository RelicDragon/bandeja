import prisma from '../../config/database';
import { UserTeamMemberStatus } from '@prisma/client';
import { GameTeamService } from '../gameTeam.service';

function logSkip(reason: string, detail: Record<string, unknown>) {
  console.warn(`[userTeamFixedTeams] skip: ${reason}`, detail);
}

export async function applyUserTeamToFixedTeamsIfReady(gameId: string, userTeamId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      maxParticipants: true,
      hasFixedTeams: true,
      rounds: { select: { id: true }, take: 1 },
    },
  });

  if (!game?.hasFixedTeams) return;
  if (game.rounds.length > 0) {
    logSkip('rounds_started', { gameId, userTeamId });
    return;
  }

  const userTeam = await prisma.userTeam.findUnique({
    where: { id: userTeamId },
    include: { members: true },
  });
  if (!userTeam) {
    logSkip('user_team_not_found', { gameId, userTeamId });
    return;
  }

  const acceptedMembers = userTeam.members.filter((m) => m.status === UserTeamMemberStatus.ACCEPTED);
  if (acceptedMembers.length < userTeam.size) return;

  const memberIds = [...new Set(acceptedMembers.map((m) => m.userId))].sort();

  const playing = await prisma.gameParticipant.findMany({
    where: { gameId, status: 'PLAYING' },
    select: { userId: true },
  });
  const playingSet = new Set(playing.map((p) => p.userId));
  if (!memberIds.every((id) => playingSet.has(id))) return;

  const existingTeams = await prisma.gameTeam.findMany({
    where: { gameId },
    include: { players: true },
    orderBy: { teamNumber: 'asc' },
  });

  const sortedMemberIds = [...memberIds].sort();

  for (const t of existingTeams) {
    const pids = [...t.players.map((p) => p.userId)].sort();
    if (
      pids.length === sortedMemberIds.length &&
      pids.every((x, i) => x === sortedMemberIds[i])
    ) {
      return;
    }
  }

  const maxTeams = Math.floor(game.maxParticipants / 2);
  if (maxTeams < 1) {
    logSkip('max_teams_lt_1', { gameId, userTeamId, maxParticipants: game.maxParticipants });
    return;
  }

  let slot = 1;
  for (; slot <= maxTeams; slot++) {
    const et = existingTeams.find((t) => t.teamNumber === slot);
    if (!et || et.players.length === 0) break;
  }
  if (slot > maxTeams) {
    logSkip('no_free_team_slot', { gameId, userTeamId, maxTeams, existingTeamNumbers: existingTeams.map((t) => t.teamNumber) });
    return;
  }

  const teamsPayload = existingTeams.map((t) => ({
    teamNumber: t.teamNumber,
    name: t.name ?? undefined,
    playerIds: t.players.map((p) => p.userId),
  }));

  teamsPayload.push({
    teamNumber: slot,
    name: userTeam.name,
    playerIds: sortedMemberIds,
  });
  teamsPayload.sort((a, b) => a.teamNumber - b.teamNumber);

  const allIds = teamsPayload.flatMap((x) => x.playerIds);
  if (new Set(allIds).size !== allIds.length) {
    logSkip('player_duplicate_across_teams', { gameId, userTeamId, teamsPayload });
    return;
  }

  await GameTeamService.setGameTeams(gameId, teamsPayload);
}
