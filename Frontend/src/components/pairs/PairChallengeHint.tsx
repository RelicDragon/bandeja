import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Swords } from 'lucide-react';
import type { UserTeam } from '@/types';
import { CreateUserTeamExplainerSheet } from '@/components/userTeam/CreateUserTeamExplainerSheet';

type Props = {
  /** The viewer's pair still waiting for a partner; null = no pair at all. */
  pendingPair: UserTeam | null;
};

/**
 * Pair challenges are pair team vs pair team. A viewer without a complete pair
 * sees no swords on any row, so the board says why once, with the next step:
 * open the pair that is waiting for its partner, or create one.
 */
export function PairChallengeHint({ pendingPair }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [explainerOpen, setExplainerOpen] = useState(false);

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
