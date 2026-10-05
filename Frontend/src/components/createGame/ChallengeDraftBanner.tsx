import { useTranslation } from 'react-i18next';
import { Swords } from 'lucide-react';
import type { ChallengeDraft } from '@/utils/userTeamChallenge';

interface ChallengeDraftBannerProps {
  challenge: ChallengeDraft;
  /** False once the organizer removed one of the prefilled players. */
  intact: boolean;
}

/**
 * Top of a create draft opened from a pair Challenge: which pairs meet, and
 * that both get invited once the game exists. Amber like the Challenge action,
 * so it is never confused with the blue rematch banner.
 */
export function ChallengeDraftBanner({ challenge, intact }: ChallengeDraftBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      data-testid="challenge-draft-banner"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/[0.08] dark:text-amber-50"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
        <Swords className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          <span dir="auto">
            {t('teams.challenge.draftTitle', {
              challenger: challenge.challengerTeamName,
              challenged: challenge.challengedTeamName,
            })}
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-snug text-amber-900/75 dark:text-amber-100/75">
          {intact ? t('teams.challenge.draftHint') : t('teams.challenge.draftHintEdited')}
        </p>
      </div>
    </div>
  );
}
