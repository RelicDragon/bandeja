import { showsPremiumStatus } from '@/utils/premiumIdentity';
import type { Game, GameParticipant } from '@/types';
import type { GameLocalizedTextProjection } from '@/utils/gameText/gameLocalizedText.types';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { participantsRenderKey, playingParticipantsKey } from '@/utils/gameCardParticipants';
import { gameCardOutcomesKey } from '@/utils/gameCardStandings';

export interface GameCardMemoProps {
  game: Game;
  user: unknown;
  onClick?: () => void;
  showChatIndicator?: boolean;
  showJoinButton?: boolean;
  onJoin?: (gameId: string, e: React.MouseEvent) => void;
  onNoteSaved?: (gameId: string) => void;
  unreadCount?: number;
  findFilterSport?: FindSportFilterValue;
}

function viewerPrefsKey(user: unknown): string {
  if (!user || typeof user !== 'object') return '';
  const u = user as {
    id?: string;
    isAdmin?: boolean;
    language?: string;
    timeFormat?: string;
    weekStart?: string;
    alwaysShowUserNames?: boolean;
    currentCityId?: string;
    currentCity?: { id?: string };
    gender?: string | null;
  };
  return [
    u.id ?? '',
    u.isAdmin ? '1' : '0',
    u.language ?? '',
    u.timeFormat ?? '',
    u.weekStart ?? '',
    u.alwaysShowUserNames === false ? '0' : '1',
    u.currentCityId ?? u.currentCity?.id ?? '',
    // PRD 359 — the viewer's gender decides how many MIX_PAIRS seats are open
    // to them, so the join label changes when it does.
    u.gender ?? '',
  ].join(':');
}

function reactionsKey(reactions: Game['reactions']): string {
  return (reactions ?? []).map((r) => `${r.userId}:${r.emoji}`).join('|');
}

function ownerRenderKey(participants: readonly GameParticipant[]): string {
  const owner = participants.find((p) => p.role === 'OWNER');
  if (!owner) return '';
  return `${owner.userId}:${showsPremiumStatus(owner.user) ? '1' : '0'}`;
}

function trainerRenderKey(game: Game): string {
  if (game.entityType !== 'TRAINING' || !game.trainerId) return '';
  const trainer = game.participants?.find((p) => p.userId === game.trainerId);
  const u = trainer?.user;
  return [
    game.trainerId,
    u?.firstName ?? '',
    u?.lastName ?? '',
    u?.avatar ?? '',
    u?.trainerRating ?? '',
    u?.trainerReviewCount ?? '',
  ].join(':');
}

function localizedFieldKey(
  field: GameLocalizedTextProjection['name'] | null | undefined,
): string {
  if (!field) return '';
  return `${field.text ?? ''}:${field.state}:${field.sourceRevision}:${field.provenance}`;
}

/** Include localizedText so card titles update when translations arrive without remounting. */
function localizedTextKey(
  projection: GameLocalizedTextProjection | null | undefined,
): string {
  if (!projection) return '';
  return [
    projection.locale,
    localizedFieldKey(projection.name),
    localizedFieldKey(projection.description),
  ].join('|');
}

/* ------------------------------------------------------------------ */
/* PRD 345–357 enrichment (CONTRACT §5.6)                              */
/*                                                                     */
/* `mergeEnrichmentOntoGames` hands the card a **new** game object, so  */
/* the identity fast path below never fires for enrichment: if a field  */
/* is missing from the signature the memoized card simply never         */
/* repaints. Every field of `GameCardEnrichment` therefore has a key    */
/* here, each one a fixed-width scalar join so a long list stays cheap. */
/* ------------------------------------------------------------------ */

/** PRD 345 — cadence pill text plus the `title` (series name) it carries. */
function seriesLabelKey(label: Game['seriesLabel']): string {
  if (!label) return '';
  return `${label.seriesId}:${label.cadence}:${label.name}:${label.endedAt ?? ''}`;
}

/** PRD 357 — tone, value and tooltip time of the rain / wind pill. */
function weatherRiskKey(risk: Game['weatherRisk']): string {
  if (!risk) return '';
  return [
    risk.severity,
    risk.pop,
    risk.windKph,
    risk.at,
    risk.keptAsPlanned ? '1' : '0',
  ].join(':');
}

/** PRD 348 — every number `GameCardPerHeadPrice` renders or announces. */
function perHeadPriceKey(price: Game['perHeadPrice']): string {
  if (!price) return '';
  return [
    price.amountCents,
    price.currency,
    price.totalCents,
    price.payerCount,
    price.estimated ? '1' : '0',
  ].join(':');
}

/** PRD 346 — the "2 of 4" fraction and the per-player dot states. */
function attendanceSummaryKey(summary: Game['attendanceSummary']): string {
  if (!summary) return '';
  return [
    summary.confirmedCount,
    summary.unsureCount,
    summary.unansweredCount,
    summary.playingCount,
    summary.viewerAttendance ?? '',
    (summary.entries ?? []).map((entry) => `${entry.userId}~${entry.attendance}`).join(','),
  ].join(':');
}

/** PRD 349 — bounded at two sides, so the join stays O(1) per card. */
function liveSummaryKey(summary: Game['liveSummary']): string {
  if (!summary) return '';
  return [
    summary.matchId,
    summary.revision ?? '',
    summary.currentSet,
    summary.startedAt ?? '',
    summary.sides
      .map((side) => `${side.teamNumber}~${side.currentGameScore}~${side.setScores.join('-')}~${side.leading ? '1' : '0'}`)
      .join(','),
  ].join(':');
}

function viewerParticipationKey(
  participants: readonly GameParticipant[],
  userId?: string
): string {
  if (!userId) return '';
  const mine = participants.find((p) => p.userId === userId);
  if (!mine) return 'absent';
  return `${mine.status}:${mine.role}`;
}

/**
 * Signatures are pure functions of an immutable `Game` object: every producer
 * (query data, `mergeEnrichmentOntoGames`, socket patches) replaces the object
 * rather than mutating it. Caching by identity means a list re-render costs one
 * map lookup per card instead of rebuilding a ~45-field string twice per
 * comparison, which matters most when a parent re-renders without new data.
 */
const signatureCache = new WeakMap<Game, string>();

function gameRenderSignature(game: Game): string {
  const cached = signatureCache.get(game);
  if (cached !== undefined) return cached;
  const signature = buildGameRenderSignature(game);
  signatureCache.set(game, signature);
  return signature;
}

function buildGameRenderSignature(game: Game): string {
  const parts = [
    game.entityType,
    // Drives the EVENT pill in `GameCardHeaderTags` and the poster card copy.
    game.eventKind ?? '',
    game.status,
    game.sport,
    game.gameType,
    game.name ?? '',
    game.isPublic ? '1' : '0',
    game.affectsRating ? '1' : '0',
    game.hasFixedTeams ? '1' : '0',
    // PRD 360 — the "Novices welcome" header tag appears and disappears with it.
    game.suitableForNovices ? '1' : '0',
    game.genderTeams ?? '',
    game.resultsStatus ?? '',
    gameCardOutcomesKey(game.outcomes),
    game.startTime ?? '',
    game.endTime ?? '',
    game.timeIsSet === false ? '0' : '1',
    game.maxParticipants ?? '',
    game.minLevel ?? '',
    game.maxLevel ?? '',
    game.trainerId ?? '',
    game.userNote ?? '',
    game.photosCount ?? '',
    game.mainPhoto?.thumbnailUrl ?? '',
    game.weatherSummary?.temperatureC ?? '',
    game.weatherSummary?.conditionKey ?? '',
    // `rightRailPropsEqual` compares `isDay`; the parent must too, or the rail
    // never gets the chance to see the change.
    game.weatherSummary?.isDay ? '1' : '0',
    game.weatherSummary?.stale ? '1' : '0',
    game.bookingStatus ?? '',
    game.hasBookedCourt ? '1' : '0',
    game.linkedBookings?.[0]?.externalBookingId ?? '',
    game.city?.id ?? '',
    game.city?.name ?? '',
    game.court?.id ?? '',
    game.court?.name ?? '',
    game.club?.name ?? '',
    game.leagueGroup?.name ?? '',
    game.leagueGroup?.color ?? '',
    game.leagueRoundId ?? '',
    game.leagueRound?.orderIndex ?? '',
    game.parent?.leagueSeason?.league?.name ?? '',
    game.parent?.leagueSeason?.game?.name ?? '',
    localizedTextKey(game.localizedText),
    localizedTextKey(game.parent?.leagueSeason?.game?.localizedText),
    game.leagueSeason?.league?.name ?? '',
    participantsRenderKey(game.participants ?? []),
    playingParticipantsKey(game.participants ?? []),
    ownerRenderKey(game.participants ?? []),
    trainerRenderKey(game),
    reactionsKey(game.reactions),
    // PRD 345–357 enrichment — see the block comment above.
    game.spotOpenedAt ?? '',
    game.lastSeatOpenedAt ?? '',
    seriesLabelKey(game.seriesLabel),
    weatherRiskKey(game.weatherRisk),
    perHeadPriceKey(game.perHeadPrice),
    attendanceSummaryKey(game.attendanceSummary),
    liveSummaryKey(game.liveSummary),
  ];
  return parts.join('\u0001');
}

export function gameCardPropsEqual(a: GameCardMemoProps, b: GameCardMemoProps): boolean {
  if (a.game.id !== b.game.id) return false;
  if (a.unreadCount !== b.unreadCount) return false;
  if (a.showChatIndicator !== b.showChatIndicator) return false;
  if (a.showJoinButton !== b.showJoinButton) return false;
  if (a.findFilterSport !== b.findFilterSport) return false;
  if (a.onClick !== b.onClick) return false;
  if (a.onJoin !== b.onJoin) return false;
  if (a.onNoteSaved !== b.onNoteSaved) return false;
  if (viewerPrefsKey(a.user) !== viewerPrefsKey(b.user)) return false;
  const aUserId = (a.user as { id?: string } | null | undefined)?.id;
  const bUserId = (b.user as { id?: string } | null | undefined)?.id;
  // Same immutable game + same viewer id ⇒ both derived keys match by construction.
  if (a.game === b.game && aUserId === bUserId) return true;
  if (
    viewerParticipationKey(a.game.participants ?? [], aUserId) !==
    viewerParticipationKey(b.game.participants ?? [], bUserId)
  ) {
    return false;
  }
  if (gameRenderSignature(a.game) !== gameRenderSignature(b.game)) return false;
  return true;
}
