import { createId } from '@paralleldrive/cuid2';
import { e2eApi, e2eGetProfile, type E2eUser } from './api-client';

type Club = { id: string; name: string; isForPlaying?: boolean; isBar?: boolean };
type Game = { id: string; participants?: Array<{ userId: string; status?: string }> };
type AvailableGamesResponse = Game[] | { games?: Game[] };
type LeagueCreateResponse = { id: string; seasons?: Array<{ id: string }> };
type SpectatorTokenResponse = { token?: string; spectatorToken?: string };
type InviteRow = { id: string; gameId?: string; receiverId?: string };

function futureWindow(hoursFromNow = 26, durationHours = 2) {
  const start = new Date(Date.now() + hoursFromNow * 3_600_000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function resolveClubId(token: string, user: E2eUser): Promise<string> {
  const profile = user.currentCity?.id ? user : await e2eGetProfile(token);
  const cityId = profile.currentCity?.id;
  if (!cityId) {
    throw new Error('[e2e] E2E user has no currentCity — seed a City and set user city');
  }
  const clubs = await e2eApi<Club[]>(token, `/clubs/city/${cityId}`);
  const club =
    clubs.find((c) => c.isForPlaying && !c.isBar) ??
    clubs.find((c) => c.isForPlaying) ??
    clubs[0];
  if (!club?.id) {
    throw new Error('[e2e] No clubs in user city — seed clubs for create-game tests');
  }
  if (!club.isForPlaying) {
    throw new Error(`[e2e] No isForPlaying club in city — seed a playing club (got ${club.name})`);
  }
  return club.id;
}

async function findOtherUserId(token: string, excludeUserId: string): Promise<string | null> {
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const raw = await e2eApi<AvailableGamesResponse>(
    token,
    `/games/available?startDate=${startDate}&endDate=${endDate}`,
  );
  const games = Array.isArray(raw) ? raw : (raw.games ?? []);
  for (const game of games) {
    for (const p of game.participants ?? []) {
      if (p.userId && p.userId !== excludeUserId) {
        return p.userId;
      }
    }
  }
  return null;
}

export type CreateGameOptions = {
  clubId?: string;
  participants?: string[];
  allowDirectJoin?: boolean;
  maxParticipants?: number;
  isPublic?: boolean;
  name?: string;
  playersPerMatch?: number;
  affectsRating?: boolean;
};

export async function createGameViaApi(
  token: string,
  userId: string,
  options: CreateGameOptions = {},
): Promise<{ id: string }> {
  const user = await e2eGetProfile(token);
  const clubId = options.clubId ?? (await resolveClubId(token, user));
  const { startTime, endTime } = futureWindow();
  const maxParticipants = options.maxParticipants ?? 4;

  const game = await e2eApi<Game>(token, '/games', {
    method: 'POST',
    body: JSON.stringify({
      sport: 'PADEL',
      entityType: 'GAME',
      gameType: 'CLASSIC',
      clubId,
      courtId: undefined,
      startTime,
      endTime,
      timeIsSet: true,
      maxParticipants,
      playersPerMatch: options.playersPerMatch ?? 4,
      minParticipants: 2,
      minLevel: 1,
      maxLevel: 7,
      isPublic: options.isPublic ?? true,
      allowDirectJoin: options.allowDirectJoin ?? true,
      anyoneCanInvite: false,
      resultsByAnyone: false,
      hasBookedCourt: false,
      affectsRating: options.affectsRating ?? true,
      hasFixedTeams: false,
      participants: options.participants ?? [userId],
      name: options.name ?? `[E2E] game ${Date.now()}`,
      genderTeams: 'ANY',
      fixedNumberOfSets: 1,
      maxTotalPointsPerSet: 0,
      winnerOfGame: 'BY_MATCHES_WON',
      winnerOfMatch: 'BY_SCORES',
      matchGenerationType: 'AMERICANO',
      pointsPerWin: 3,
      pointsPerLoose: 1,
      pointsPerTie: 2,
      ballsInGames: false,
      scoringMode: 'POINTS',
      hasGoldenPoint: true,
    }),
  });

  if (!game?.id) {
    throw new Error('[e2e] create game response missing id');
  }
  return { id: game.id };
}

export async function createNoRatingGameViaApi(
  token: string,
  userId: string,
  name?: string,
): Promise<{ id: string }> {
  return createGameViaApi(token, userId, {
    participants: [userId],
    allowDirectJoin: true,
    affectsRating: false,
    name: name ?? `[E2E] no-rating ${Date.now()}`,
  });
}

/** Owner NON_PLAYING — user can join via UI CTA. */
export async function createJoinableGame(token: string, userId: string): Promise<{ id: string }> {
  return createGameViaApi(token, userId, {
    participants: [],
    allowDirectJoin: true,
    maxParticipants: 4,
    isPublic: true,
  });
}

/** Requires owner approval — join adds user to queue. */
export async function createQueueOnlyGame(token: string, userId: string, name?: string): Promise<{ id: string }> {
  return createGameViaApi(token, userId, {
    participants: [],
    allowDirectJoin: false,
    maxParticipants: 4,
    isPublic: true,
    name: name ?? `[E2E] queue game ${Date.now()}`,
  });
}

export async function createPrivateGame(token: string, userId: string): Promise<{ id: string }> {
  return createGameViaApi(token, userId, {
    participants: [userId],
    allowDirectJoin: false,
    maxParticipants: 4,
    isPublic: false,
    name: `[E2E] private ${Date.now()}`,
  });
}

export async function joinGameViaApi(token: string, gameId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/join`, { method: 'POST', body: '{}' }).catch(async () => {
    await e2eApi(token, `/games/${gameId}/toggle-playing-status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'PLAYING' }),
    });
  });
}

export async function joinQueueViaApi(token: string, gameId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/join`, { method: 'POST', body: '{}' });
}

export async function acceptJoinQueueViaApi(token: string, gameId: string, userId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/accept-join-queue`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function declineJoinQueueViaApi(token: string, gameId: string, userId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/decline-join-queue`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function cancelJoinQueueViaApi(token: string, gameId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/cancel-join-queue`, { method: 'POST', body: '{}' });
}

export async function joinAsGuestViaApi(token: string, gameId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/join-as-guest`, { method: 'POST', body: '{}' });
}

export async function leaveGameViaApi(token: string, gameId: string): Promise<void> {
  await e2eApi(token, `/games/${gameId}/leave`, { method: 'POST', body: '{}' });
}

export async function deleteGameViaApi(token: string, gameId: string): Promise<void> {
  try {
    await e2eApi(token, `/games/${gameId}`, { method: 'DELETE' });
  } catch {
    /* already gone */
  }
}

export type LiveScoringFixture = { gameId: string; matchId: string };

export type ResultsEntryFixture = LiveScoringFixture;

async function ensureMatchWithTeams(
  token: string,
  gameId: string,
  userId: string,
  otherUserId: string,
): Promise<string> {
  await e2eApi(token, `/results/game/${gameId}/start-results-entry`, { method: 'POST', body: '{}' }).catch(() => undefined);

  type ResultsPayload = { rounds?: Array<{ matches?: Array<{ id: string }> }> };
  const results = await e2eApi<ResultsPayload>(token, `/results/game/${gameId}`);
  let matchId = results.rounds?.[0]?.matches?.[0]?.id;

  if (!matchId) {
    const roundId = createId();
    matchId = createId();
    await e2eApi(token, `/results/game/${gameId}/rounds`, {
      method: 'POST',
      body: JSON.stringify({ id: roundId }),
    });
    await e2eApi(token, `/results/game/${gameId}/rounds/${roundId}/matches`, {
      method: 'POST',
      body: JSON.stringify({ id: matchId }),
    });
  }

  await e2eApi(token, `/results/game/${gameId}/matches/${matchId}`, {
    method: 'PUT',
    body: JSON.stringify({
      teamA: [userId],
      teamB: [otherUserId],
      sets: [{ teamA: 0, teamB: 0 }],
    }),
  });

  return matchId!;
}

export async function createLiveScoringFixtureWithUserB(
  token: string,
  userAId: string,
  userBId: string,
): Promise<LiveScoringFixture> {
  return buildLiveScoringFixture(token, userAId, userBId);
}

export async function createLiveScoringFixture(token: string, userId: string): Promise<LiveScoringFixture> {
  const otherUserId = (await findOtherUserId(token, userId)) ?? userId;
  return buildLiveScoringFixture(token, userId, otherUserId);
}

async function buildLiveScoringFixture(
  token: string,
  userId: string,
  otherUserId: string,
): Promise<LiveScoringFixture> {
  const { id: gameId } = await createGameViaApi(token, userId, {
    maxParticipants: 2,
    playersPerMatch: 2,
    participants: [userId],
  });

  const matchId = await ensureMatchWithTeams(token, gameId, userId, otherUserId);
  return { gameId, matchId };
}

export async function createResultsEntryFixture(
  token: string,
  userId: string,
  otherUserId?: string,
): Promise<ResultsEntryFixture> {
  const other = otherUserId ?? (await findOtherUserId(token, userId)) ?? userId;
  const { id: gameId } = await createGameViaApi(token, userId, {
    maxParticipants: 4,
    playersPerMatch: 2,
    participants: [userId],
  });
  const matchId = await ensureMatchWithTeams(token, gameId, userId, other);
  return { gameId, matchId };
}

export async function createGameWithOwnerPlaying(
  token: string,
  ownerId: string,
  name?: string,
): Promise<{ id: string }> {
  return createGameViaApi(token, ownerId, {
    participants: [ownerId],
    allowDirectJoin: true,
    maxParticipants: 4,
    isPublic: true,
    name: name ?? `[E2E] owner game ${Date.now()}`,
  });
}

export async function getCityClubNames(token: string, user: E2eUser): Promise<string[]> {
  const cityId = user.currentCity?.id ?? (await e2eGetProfile(token)).currentCity?.id;
  if (!cityId) return [];
  const clubs = await e2eApi<Club[]>(token, `/clubs/city/${cityId}`);
  return clubs.map((c) => c.name).filter((name): name is string => Boolean(name));
}

export async function findPublicGameId(token: string): Promise<string | null> {
  const { id } = await createGameViaApi(token, (await e2eGetProfile(token)).id, {
    isPublic: true,
    participants: [],
  });
  return id;
}

export async function createLeagueSeasonViaApi(
  token: string,
): Promise<{ leagueId: string; seasonId: string }> {
  const user = await e2eGetProfile(token);
  const cityId = user.currentCity?.id;
  if (!cityId) {
    throw new Error('[e2e] E2E user has no currentCity for league create');
  }
  const clubId = await resolveClubId(token, user);
  const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const league = await e2eApi<LeagueCreateResponse>(token, '/leagues', {
    method: 'POST',
    body: JSON.stringify({
      name: `[E2E] league ${Date.now()}`,
      cityId,
      clubId,
      season: {
        name: `${new Date().getFullYear()}`,
        sport: 'PADEL',
        minLevel: 1,
        maxLevel: 7,
        maxParticipants: 8,
        startDate,
        gameSeason: {
          fixedNumberOfSets: 1,
          maxTotalPointsPerSet: 0,
          maxPointsPerTeam: 0,
          winnerOfGame: 'BY_MATCHES_WON',
          winnerOfMatch: 'BY_SCORES',
          matchGenerationType: 'HANDMADE',
          pointsPerWin: 3,
          pointsPerLoose: 1,
          pointsPerTie: 2,
          ballsInGames: false,
          scoringMode: 'CLASSIC',
          hasGoldenPoint: true,
          gameType: 'CLASSIC',
        },
      },
    }),
  });

  const seasonId = league.seasons?.[0]?.id;
  if (!league.id || !seasonId) {
    throw new Error('[e2e] league create response missing season id');
  }
  return { leagueId: league.id, seasonId };
}

export async function getLiveSpectatorTokenViaApi(
  token: string,
  gameId: string,
  matchId: string,
): Promise<string> {
  const res = await e2eApi<SpectatorTokenResponse>(
    token,
    `/results/game/${gameId}/matches/${matchId}/live-spectator-token`,
    { method: 'POST', body: '{}' },
  );
  const st = res.token ?? res.spectatorToken;
  if (!st) {
    throw new Error('[e2e] live spectator token missing in response');
  }
  return st;
}

export async function getPendingInviteIdForGame(
  token: string,
  gameId: string,
): Promise<string | null> {
  const invites = await e2eApi<InviteRow[]>(token, `/invites/game/${gameId}`);
  return invites[0]?.id ?? null;
}
