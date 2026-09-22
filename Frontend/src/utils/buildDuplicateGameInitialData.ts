import type { BasicUser, Game } from '@/types';
import { gameRosterFromMatchFormat } from '@/utils/userMaxParticipantsInGame';
import { authoredGameTextForEdit } from '@/utils/gameText/authoredGameTextForEdit';

/** Fields copied when duplicating a game or “play again” from results. */
export function buildDuplicateGameInitialData(game: Game): Partial<Game> {
  const maxParticipants =
    game.entityType === 'GAME'
      ? gameRosterFromMatchFormat(game.playersPerMatch ?? 4)
      : game.maxParticipants;

  const authored = authoredGameTextForEdit(game);

  const data: Partial<Game> = {
    entityType: game.entityType,
    gameType: game.gameType,
    name: authored.name || null,
    description: authored.description || null,
    clubId: game.clubId,
    courtId: game.courtId,
    startTime: game.startTime,
    endTime: game.endTime,
    sport: game.sport,
    scoringPreset: game.scoringPreset,
    scoringMode: game.scoringMode,
    maxParticipants,
    playersPerMatch: game.playersPerMatch,
    minParticipants: game.minParticipants,
    minLevel: game.minLevel,
    maxLevel: game.maxLevel,
    isPublic: game.isPublic,
    affectsRating: game.affectsRating,
    anyoneCanInvite: game.anyoneCanInvite,
    resultsByAnyone: game.resultsByAnyone,
    allowDirectJoin: game.allowDirectJoin,
    hasBookedCourt: game.hasBookedCourt,
    afterGameGoToBar: game.afterGameGoToBar,
    // PRD 360 — the promise is about how this organizer runs a game, so it
    // travels with the format into the next one (plan §5.4 allow-list).
    suitableForNovices: game.suitableForNovices,
    hasFixedTeams: game.hasFixedTeams,
    genderTeams: game.genderTeams,
    priceTotal: game.priceTotal,
    priceType: game.priceType,
    priceCurrency: game.priceCurrency,
    fixedNumberOfSets: game.fixedNumberOfSets,
    maxTotalPointsPerSet: game.maxTotalPointsPerSet,
    maxPointsPerTeam: game.maxPointsPerTeam,
    winnerOfGame: game.winnerOfGame,
    winnerOfMatch: game.winnerOfMatch,
    matchGenerationType: game.matchGenerationType,
    pointsPerWin: game.pointsPerWin,
    pointsPerLoose: game.pointsPerLoose,
    pointsPerTie: game.pointsPerTie,
    ballsInGames: game.ballsInGames,
    deucesBeforeGoldenPoint: game.deucesBeforeGoldenPoint,
    matchTimerEnabled: game.matchTimerEnabled,
    matchTimedCapMinutes: game.matchTimedCapMinutes,
    gameCourts: game.gameCourts,
  };

  if (game.entityType === 'LEAGUE_SEASON') {
    if (game.parentId) {
      data.parentId = game.parentId;
    } else if (game.leagueSeason?.league?.id) {
      data.parentId = game.leagueSeason.league.id;
    }
  }

  return data;
}

/**
 * PRD 362 — everything a finished game must **not** hand to a rematch draft.
 *
 * Duplicate (above) is "the same game on another day": it keeps the court and
 * the old slot because an editor is usually moving an unplayed game. A rematch
 * starts from a played-out game, so nothing about *when* or *where* it happened
 * is still valid, and nothing that came out of playing it (booking, results,
 * attendance, cost) may leak. The list is exported so the test can assert
 * every key is absent rather than trusting the builder.
 */
export const REMATCH_EXCLUDED_KEYS = [
  'courtId',
  'gameCourts',
  'startTime',
  'endTime',
  'hasBookedCourt',
  'bookingStatus',
  'externalBookingIds',
  'externalBookingProvider',
  'bookingSnapshots',
  'seriesId',
  'seriesOccurrenceDate',
  'trainerId',
  'autoFillFromQueue',
  'showOnLiveRail',
  'paymentHint',
  'paymentMethods',
  'costPayerId',
  'costFrozenAt',
  'participants',
  'outcomes',
  'resultsStatus',
  'resultsSummaryText',
  'status',
  'id',
  'mainPhotoId',
  'mainPhoto',
  'weatherAlertState',
] as const;

/**
 * PRD 362 — the create-flow seed for **Play with this group again**.
 *
 * Copies the format allow-list (entity type, template, level band, gender rule,
 * club as a venue hint, price, settings, format numbers) and clears the
 * schedule so the wizard *requires* a fresh date, time and court. `timeIsSet`
 * is set to `false` explicitly rather than left undefined so a later reader of
 * the draft cannot mistake "not copied" for "still valid".
 */
export function buildRematchGameInitialData(game: Game): Partial<Game> {
  const data = buildDuplicateGameInitialData(game) as Partial<Game> & Record<string, unknown>;
  for (const key of REMATCH_EXCLUDED_KEYS) {
    delete data[key];
  }
  data.timeIsSet = false;
  return data;
}

export interface RematchInvitees {
  /** Previous PLAYING roster minus the viewer; the trainer is appended when invited as trainer. */
  playerIds: string[];
  /** The same people, so the create flow can show chips before any store lookup resolves. */
  players: BasicUser[];
  /**
   * TRAINING only: the previous trainer, when one was set and is not the
   * viewer. The create flow sends this person an `asTrainer` invite.
   */
  trainerId: string | null;
}

/**
 * PRD 362 — who gets invited to the rematch.
 *
 * Only `status === 'PLAYING'` rows count (the same rule as seats): queue,
 * invited, guest and NON_PLAYING never do. The viewer is the new organizer and
 * is never invited to their own game. Blocked users are not filtered here; the
 * invite endpoint re-validates on send, exactly as it does for a hand-picked
 * invite. Nobody is seated — these are invitations.
 */
export function previousRosterInvitees(
  game: Pick<Game, 'entityType' | 'participants' | 'trainerId'>,
  viewerId: string | undefined,
): RematchInvitees {
  const seen = new Set<string>();
  const playerIds: string[] = [];
  const players: BasicUser[] = [];

  for (const participant of game.participants ?? []) {
    if (participant.status !== 'PLAYING') continue;
    if (!participant.userId || participant.userId === viewerId) continue;
    if (seen.has(participant.userId)) continue;
    seen.add(participant.userId);
    playerIds.push(participant.userId);
    if (participant.user) players.push(participant.user);
  }

  let trainerId: string | null = null;
  if (game.entityType === 'TRAINING' && game.trainerId && game.trainerId !== viewerId) {
    trainerId = game.trainerId;
    if (!seen.has(trainerId)) {
      seen.add(trainerId);
      playerIds.push(trainerId);
      const trainer = (game.participants ?? []).find((p) => p.userId === trainerId)?.user;
      if (trainer) players.push(trainer);
    }
  }

  return { playerIds, players, trainerId };
}
