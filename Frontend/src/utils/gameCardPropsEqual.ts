import type { Game, GameParticipant } from '@/types';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { participantsRenderKey, playingParticipantsKey } from '@/utils/gameCardParticipants';

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
  };
  return [
    u.id ?? '',
    u.isAdmin ? '1' : '0',
    u.language ?? '',
    u.timeFormat ?? '',
    u.weekStart ?? '',
    u.alwaysShowUserNames === false ? '0' : '1',
    u.currentCityId ?? u.currentCity?.id ?? '',
  ].join(':');
}

function reactionsKey(reactions: Game['reactions']): string {
  return (reactions ?? []).map((r) => `${r.userId}:${r.emoji}`).join('|');
}

function ownerRenderKey(participants: readonly GameParticipant[]): string {
  const owner = participants.find((p) => p.role === 'OWNER');
  if (!owner) return '';
  return `${owner.userId}:${owner.user?.isPremium ? '1' : '0'}`;
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

function viewerParticipationKey(
  participants: readonly GameParticipant[],
  userId?: string
): string {
  if (!userId) return '';
  const mine = participants.find((p) => p.userId === userId);
  if (!mine) return 'absent';
  return `${mine.status}:${mine.role}`;
}

function gameRenderSignature(game: Game): string {
  const parts = [
    game.entityType,
    game.status,
    game.sport,
    game.gameType,
    game.name ?? '',
    game.isPublic ? '1' : '0',
    game.affectsRating ? '1' : '0',
    game.hasFixedTeams ? '1' : '0',
    game.genderTeams ?? '',
    game.resultsStatus ?? '',
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
    game.leagueSeason?.league?.name ?? '',
    participantsRenderKey(game.participants ?? []),
    playingParticipantsKey(game.participants ?? []),
    ownerRenderKey(game.participants ?? []),
    trainerRenderKey(game),
    reactionsKey(game.reactions),
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
  if (
    viewerParticipationKey(a.game.participants ?? [], aUserId) !==
    viewerParticipationKey(b.game.participants ?? [], bUserId)
  ) {
    return false;
  }
  if (gameRenderSignature(a.game) !== gameRenderSignature(b.game)) return false;
  return true;
}
