import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { computeSeatInfo } from '@/components/gameCard/gameCardSeatInfo';
import { ordinalLabel } from '@/utils/formatOrdinal';

const pill = 'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold';

const TONES = {
  playing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  invited: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  queue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  role: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  muted: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
} as const;

type Props = {
  game: Game;
  userId: string | undefined;
  /** Appends the seat count ("Playing · 4/4") — used by the Next up card. */
  withSeats?: boolean;
};

/**
 * The one status pill a game row carries: the viewer's own place in the game.
 * Seat status beats role, so an organizer who plays reads "Playing".
 */
export function ChatListGameStatusPill({ game, userId, withSeats = false }: Props) {
  const { t, i18n } = useTranslation();
  const mine = userId ? game.participants?.find((p) => p.userId === userId) : undefined;

  /** PRD 359 — a queued player sees their place without opening the game. */
  const queuePosition = useMemo(
    () =>
      mine?.status === 'IN_QUEUE'
        ? computeSeatInfo(game, game.participants, userId ? { id: userId } : null).viewerQueuePosition
        : null,
    [mine?.status, game, userId]
  );

  if (!mine) return null;

  const seats = withSeats && game.maxParticipants > 0
    ? ` · ${game.participants.filter((p) => p.status === 'PLAYING').length}/${game.maxParticipants}`
    : '';

  switch (mine.status) {
    case 'PLAYING':
      return <span className={`${pill} ${TONES.playing}`}>{t('games.badgePlaying', { defaultValue: 'Playing' })}{seats}</span>;
    case 'INVITED':
      return <span className={`${pill} ${TONES.invited}`}>{t('games.statusInvited')}</span>;
    case 'IN_QUEUE': {
      const position =
        queuePosition != null
          ? ordinalLabel(queuePosition, i18n.language, (p) => t('games.queuePositionOrdinal', { position: p }))
          : null;
      return (
        <span className={`${pill} ${TONES.queue}`}>
          {position ? t('games.statusInQueueWithPosition', { position }) : t('games.statusInQueue')}
        </span>
      );
    }
    default:
      break;
  }
  if (mine.role === 'OWNER') return <span className={`${pill} ${TONES.role}`}>{t('games.owner')}</span>;
  if (mine.role === 'ADMIN') return <span className={`${pill} ${TONES.role}`}>{t('games.admin')}</span>;
  if (mine.status === 'GUEST') return <span className={`${pill} ${TONES.muted}`}>{t('games.statusGuest')}</span>;
  if (mine.status === 'NON_PLAYING') return <span className={`${pill} ${TONES.muted}`}>{t('games.statusNonPlaying')}</span>;
  return null;
}
