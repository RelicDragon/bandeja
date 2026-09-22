import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import type { RematchSource } from '@/components/GameDetails/playWithGroupAgain';

interface RematchDraftBannerProps {
  source: RematchSource;
  /** Invitees currently in the draft; the organizer may have removed some. */
  inviteeCount: number;
}

/**
 * PRD 362 — one quiet line at the top of a rematch draft.
 *
 * Says where the prefilled format came from and what is still required (a new
 * date, time and court), so the organizer is not surprised that the time is
 * empty while everything else is set. Not dismissible: it is context for a
 * user-initiated workflow, not a suggestion.
 */
export function RematchDraftBanner({ source, inviteeCount }: RematchDraftBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      data-testid="rematch-draft-banner"
      className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-primary-900 dark:border-primary-800/60 dark:bg-primary-950/40 dark:text-primary-100"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-300">
        <Users className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          {inviteeCount > 0
            ? t('createGame.rematch.title', { count: inviteeCount })
            : t('createGame.rematch.titleNoInvitees')}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-primary-800/80 dark:text-primary-200/80">
          <span dir="auto">{t('createGame.rematch.hint', { name: source.title })}</span>
        </p>
      </div>
    </div>
  );
}
