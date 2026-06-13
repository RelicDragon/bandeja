import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { useBooktimeOrphanLink } from '@/hooks/useBooktimeOrphanLink';

type Props = {
  game: Game;
  isOwner: boolean;
};

export function BooktimeOrphanBookingNotice({ game, isOwner }: Props) {
  const { t } = useTranslation();
  const { orphan, missingCount } = useBooktimeOrphanLink(game, isOwner, true);

  if (orphan !== true) return null;

  return (
    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
      {missingCount > 1
        ? t('club.booktime.orphanBookingNoticeMulti', { count: missingCount })
        : t('club.booktime.orphanBookingNotice')}
    </p>
  );
}
