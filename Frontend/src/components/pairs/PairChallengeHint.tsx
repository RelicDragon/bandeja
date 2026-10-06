import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Swords } from 'lucide-react';
import type { UserTeam } from '@/types';
import { CreateUserTeamExplainerSheet } from '@/components/userTeam/CreateUserTeamExplainerSheet';

type Props =
  /** Viewer has a complete team; the board holds pairs that aren't teams. */
  | { teamsOnly: true; pendingPair?: never }
  /** Viewer has no complete team: `pendingPair` is the one waiting for a partner, null = none. */
  | { teamsOnly?: false; pendingPair: UserTeam | null };

/**
 * Pair challenges are team vs team, and rows that aren't challengeable show no
 * control. The board says so once: a quiet "only teams" line for a viewer who
 * can challenge, or the next step (open the waiting team / create one) for a
 * viewer who can't yet.
 */
export function PairChallengeHint({ teamsOnly, pendingPair }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [explainerOpen, setExplainerOpen] = useState(false);

  if (teamsOnly) {
    return (
      <p
        data-testid="pair-challenge-hint-teams-only"
        className="flex items-center gap-1.5 px-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400"
      >
        <Swords size={12} strokeWidth={2.1} className="shrink-0 text-amber-500/80" aria-hidden />
        <span className="min-w-0">{t('teams.challenge.boardHintTeamsOnly')}</span>
      </p>
    );
  }

  return (
    <div
      data-testid="pair-challenge-hint"
      className="flex items-center gap-2.5 rounded-xl bg-amber-500/8 px-3 py-2 dark:bg-amber-400/10"
    >
      <Swords size={16} strokeWidth={2.1} className="shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-snug text-gray-600 dark:text-gray-300">
        {pendingPair
          ? t('teams.challenge.boardHintPending', { name: pendingPair.name })
          : t('teams.challenge.boardHint')}
      </p>
      <button
        type="button"
        data-testid="pair-challenge-hint-action"
        onClick={() =>
          pendingPair ? navigate(`/user-team/${pendingPair.id}`) : setExplainerOpen(true)
        }
        className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-300"
      >
        {pendingPair ? t('teams.challenge.boardHintOpen') : t('teams.challenge.boardHintCreate')}
      </button>
      {pendingPair ? null : (
        <CreateUserTeamExplainerSheet open={explainerOpen} onOpenChange={setExplainerOpen} />
      )}
    </div>
  );
}
