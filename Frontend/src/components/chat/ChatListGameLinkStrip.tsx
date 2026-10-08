import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronRight } from 'lucide-react';
import type { LinkPreviewData } from '@/api/linkPreview';
import type { ChatListGameLink } from './chatListGameLink';

type Props = { link: ChatListGameLink; preview: LinkPreviewData };

/** "Sat 10:00 · 2 spots left" under a message that shares a game. */
export function ChatListGameLinkStrip({ link, preview }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const when = preview.description?.split('\n').filter(Boolean).pop() ?? '';
  const count = preview.participantCount;
  const capacity = preview.participantCapacity;
  const seats =
    preview.status === 'ANNOUNCED' && count != null && capacity != null
      ? capacity - count > 0
        ? t('games.participantsSpotsLeft', { count: capacity - count })
        : t('games.card.full')
      : null;
  const label = [when || preview.title, seats].filter(Boolean).join(' · ');
  if (!label) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/games/${link.gameId}`);
      }}
      className="mt-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-xl bg-gray-100 px-2.5 py-1.5 text-start text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden />
    </button>
  );
}
