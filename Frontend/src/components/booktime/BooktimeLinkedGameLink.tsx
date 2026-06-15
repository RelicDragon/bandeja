import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { BooktimeLinkedGame } from '@/api/booktime';

type Props = {
  game: BooktimeLinkedGame;
};

export function BooktimeLinkedGameLink({ game }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = game.name?.trim() || t('club.booktime.linkedGameUntitled');

  return (
    <button
      type="button"
      onClick={() => navigate(`/games/${game.id}`)}
      className="mt-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-md border border-primary-200/60 bg-primary-50/80 px-2 py-1.5 text-left transition-colors hover:bg-primary-100/80 dark:border-primary-800/50 dark:bg-primary-950/30 dark:hover:bg-primary-950/50"
    >
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary-700 dark:text-primary-300">
        {title}
      </span>
      <ChevronRight size={14} className="shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
    </button>
  );
}
