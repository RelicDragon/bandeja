import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { BRACKET_TREE_CARD_CLASS, type BracketByeCardView } from '@/features/leagueBracket';

interface LeagueBracketByeCardProps {
  cardView: BracketByeCardView;
  groupColor?: string | null;
  advanceRoundLabel?: string | null;
  onChampionPath?: boolean;
  deEmphasize?: boolean;
}

export function LeagueBracketByeCard({
  cardView,
  groupColor,
  advanceRoundLabel,
  onChampionPath,
  deEmphasize,
}: LeagueBracketByeCardProps) {
  const { t } = useTranslation();
  const { name, users, seed } = cardView;
  const color = getLeagueGroupColor(groupColor);
  const soft = getLeagueGroupSoftColor(groupColor);

  return (
    <div
      className={`bracket-tree-card relative ${BRACKET_TREE_CARD_CLASS} rounded-lg border border-dashed px-2 py-2 ${
        onChampionPath
          ? 'border-amber-400/90 bg-amber-50/90 dark:border-amber-600/70 dark:bg-amber-950/30'
          : 'border-gray-300/90 bg-gray-50/80 dark:border-gray-600 dark:bg-gray-900/40'
      } ${deEmphasize ? 'opacity-45 saturate-50' : ''}`}
      aria-label={t('gameDetails.bracketByeAria', { seed: seed ?? '—', name: name || t('gameDetails.bracketTbd') })}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg opacity-60"
        style={{ backgroundColor: color }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('gameDetails.bracketBye')}
      </p>
      {seed != null && (
        <span
          className="mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: soft, color }}
        >
          #{seed}
        </span>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        {users.length > 0 ? (
          <div className="flex -space-x-1.5">
            {users.map((u, i) => (
              <span key={u.id} className="relative rounded-full ring-2 ring-white dark:ring-gray-900" style={{ zIndex: i + 1 }}>
                <PlayerAvatar player={u} inlineFace inlineFacePlain inlineFaceSize="sm" showName={false} subscribePresence={false} asDiv />
              </span>
            ))}
          </div>
        ) : null}
        <p className="min-w-0 truncate text-xs font-medium text-gray-800 dark:text-gray-100">
          {name || t('gameDetails.bracketTbd')}
        </p>
      </div>
      {advanceRoundLabel ? (
        <p className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500">
          {t('gameDetails.bracketByeAdvance', { round: advanceRoundLabel })}
        </p>
      ) : null}
    </div>
  );
}
