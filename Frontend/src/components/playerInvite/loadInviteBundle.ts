import { invitesApi } from '@/api';
import { gamesApi } from '@/api/games';
import type { NearbyInvitableCity } from '@/api/users';
import { userTeamsApi } from '@/api/userTeams';
import type { BasicUser, GameInviteOutcome, GameParticipant, Sport, UserTeam } from '@/types';
import { usePlayersStore } from '@/store/playersStore';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { participantBlocksInvitePlayerPicker } from '@/utils/gameInviteParticipant';
import {
  isUserTeamReady,
  mergeUserTeamsForInviteList,
  teamIsFullyInvitable,
} from '@/components/playerInvite/inviteEntries';

export interface InviteBundleGameContext {
  timeIsSet: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timeZone?: string | null;
}

export interface InviteBundleParams {
  gameId?: string;
  gameSport?: Sport;
  /** Server-side name search (2+ characters) or undefined for the zero-query list. */
  serverSearchQuery?: string;
  /** Draft slot when there is no game yet. */
  slot?: { startTime: string; endTime: string };
  cityId?: string;
  filterPlayerIds: string[];
  inviteAsTrainerOnly: boolean;
}

/** Everything one invite-modal list state needs, loaded once and cached per query (PRD 361). */
export interface InviteBundle {
  /** Invitable players with seated, invited and busy users already removed. */
  players: BasicUser[];
  /** Nearby-city name hits, only when the search found nobody in the Browse city. */
  nearbyGroups: NearbyInvitableCity[];
  readyTeams: UserTeam[];
  inviteOutcomes: GameInviteOutcome[];
  gameContext: InviteBundleGameContext | null;
  /** A TRAINING game with no trainer yet: the picker may offer "invite as trainer". */
  trainerSeatOpen: boolean;
}

export async function loadInviteBundle(params: InviteBundleParams): Promise<InviteBundle> {
  const { gameId, gameSport, serverSearchQuery, slot, cityId, filterPlayerIds, inviteAsTrainerOnly } = params;

  const fetchedPlayers = await usePlayersStore.getState().fetchPlayers(
    gameId,
    gameSport,
    serverSearchQuery,
    !gameId ? slot : undefined,
    { cityId, expandNearby: Boolean(serverSearchQuery) },
  );

  const [inviteTeams] = await Promise.all([
    userTeamsApi.getForPlayerInvite({ gameId, sport: gameSport }).catch(() => [] as UserTeam[]),
    useUserTeamsStore.getState().refreshAll(),
  ]);
  const { teams, memberships } = useUserTeamsStore.getState();
  const storeTeams = mergeUserTeamsForInviteList(teams, memberships);
  const mergedTeamMap = new Map<string, UserTeam>();
  for (const t of inviteTeams) mergedTeamMap.set(t.id, t);
  for (const t of storeTeams) if (!mergedTeamMap.has(t.id)) mergedTeamMap.set(t.id, t);
  const merged = [...mergedTeamMap.values()];

  const [gameResponse, invitesResponse] = await Promise.allSettled([
    gameId ? gamesApi.getById(gameId) : Promise.resolve(null),
    gameId ? invitesApi.getGameInvites(gameId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
  ]);

  const participantIds = new Set<string>();
  const invitedUserIds = new Set<string>();
  let inviteOutcomes: GameInviteOutcome[] = [];
  let gameContext: InviteBundleGameContext | null = null;
  let trainerSeatOpen = false;

  if (gameId && gameResponse.status === 'fulfilled' && gameResponse.value?.data) {
    const gameData = gameResponse.value.data;
    const participants = gameData.participants;
    if (Array.isArray(participants)) {
      (participants as GameParticipant[]).forEach((p) => {
        if (participantBlocksInvitePlayerPicker(p)) participantIds.add(p.userId);
      });
      inviteOutcomes = Array.isArray(gameData.inviteOutcomes)
        ? (gameData.inviteOutcomes as GameInviteOutcome[])
        : [];
    }
    if (!inviteAsTrainerOnly && gameData.entityType === 'TRAINING' && !gameData.trainerId) {
      trainerSeatOpen = true;
    }
    gameContext = {
      timeIsSet: gameData.timeIsSet === true,
      startTime: gameData.startTime,
      endTime: gameData.endTime,
      timeZone: gameData.club?.city?.timezone ?? gameData.city?.timezone ?? null,
    };
  }

  if (gameId && invitesResponse.status === 'fulfilled' && invitesResponse.value?.data) {
    const invites = invitesResponse.value.data;
    if (Array.isArray(invites)) {
      invites.forEach((invite: { status?: string; receiverId?: string }) => {
        if (invite.status === 'PENDING' && invite.receiverId) {
          invitedUserIds.add(invite.receiverId);
        }
      });
    }
  }

  const busyUserIds =
    'busyUserIds' in fetchedPlayers && Array.isArray(fetchedPlayers.busyUserIds)
      ? fetchedPlayers.busyUserIds
      : [];
  const blockedIds = new Set([...participantIds, ...invitedUserIds, ...busyUserIds]);
  const players = fetchedPlayers.filter((player) => !blockedIds.has(player.id));
  const nearbyGroups =
    serverSearchQuery && players.length === 0
      ? (fetchedPlayers.nearby ?? [])
          .map((group) => ({
            ...group,
            players: group.players.filter((player) => !blockedIds.has(player.id)),
          }))
          .filter((group) => group.players.length > 0)
      : [];

  const readyTeams = merged.filter(
    (team) =>
      isUserTeamReady(team) &&
      teamIsFullyInvitable(team, participantIds, invitedUserIds, [...filterPlayerIds, ...busyUserIds]),
  );

  return { players, nearbyGroups, readyTeams, inviteOutcomes, gameContext, trainerSeatOpen };
}
