import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowLeftRight, Repeat2, UserMinus, UserRound } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';
import type { ResultsTeam } from '@/utils/resultsBoardNavigation';
import { ActionSheet, type ActionSheetItem } from './ActionSheet';

export type SwapCandidateGroup = 'match' | 'round' | 'resting';

export interface SwapCandidate {
  player: BasicUser;
  group: SwapCandidateGroup;
  hint: string;
}

interface LineupPlayerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: BasicUser | null;
  /** e.g. "Round 2 · Match 1 · Team A" */
  description: string | null;
  team: ResultsTeam | null;
  canMove: boolean;
  swapCandidates: SwapCandidate[];
  onMove: () => void;
  onSwap: (otherPlayerId: string) => void;
  onRemove: () => void;
  onViewProfile: () => void;
}

const GROUP_ORDER: SwapCandidateGroup[] = ['match', 'round', 'resting'];

const fullName = (player: BasicUser) =>
  [player.firstName, player.lastName].filter(Boolean).join(' ') || '—';

export const LineupPlayerSheet = ({
  open,
  onOpenChange,
  player,
  description,
  team,
  canMove,
  swapCandidates,
  onMove,
  onSwap,
  onRemove,
  onViewProfile,
}: LineupPlayerSheetProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'actions' | 'swap'>('actions');

  useEffect(() => {
    if (open) setMode('actions');
  }, [open, player?.id]);

  const groupLabel: Record<SwapCandidateGroup, string> = {
    match: t('gameResults.swapGroupMatch'),
    round: t('gameResults.swapGroupRound'),
    resting: t('gameResults.swapGroupResting'),
  };

  const otherTeamLabel = team === 'teamA' ? t('gameResults.teamB') : t('gameResults.teamA');

  const items = useMemo<ActionSheetItem[]>(() => {
    if (!player) return [];
    const list: ActionSheetItem[] = [];
    if (canMove) {
      list.push({
        id: 'move',
        label: t('gameResults.moveToTeam', { team: otherTeamLabel }),
        icon: ArrowLeftRight,
        onSelect: onMove,
      });
    }
    if (swapCandidates.length > 0) {
      list.push({
        id: 'swap',
        label: t('gameResults.swapWith'),
        icon: Repeat2,
        keepOpen: true,
        onSelect: () => setMode('swap'),
      });
    }
    list.push({
      id: 'profile',
      label: t('gameResults.viewProfile'),
      icon: UserRound,
      afterClose: true,
      onSelect: onViewProfile,
    });
    list.push({
      id: 'remove',
      label: t('gameResults.removeFromMatch'),
      icon: UserMinus,
      tone: 'danger',
      onSelect: onRemove,
    });
    return list;
  }, [player, canMove, swapCandidates.length, otherTeamLabel, onMove, onViewProfile, onRemove, t]);

  if (!player) return null;

  const leading = (
    <PlayerAvatar player={player} asDiv extrasmall fullHideName showName={false} draggable={false} />
  );

  if (mode === 'swap') {
    return (
      <ActionSheet
        open={open}
        onOpenChange={onOpenChange}
        modalId="lineup-player-sheet"
        title={t('gameResults.swapWithTitle', { name: player.firstName || fullName(player) })}
        description={description}
        leading={leading}
      >
        <button
          type="button"
          onClick={() => setMode('actions')}
          className="mb-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          <ArrowLeft size={14} aria-hidden />
          {t('common.back')}
        </button>
        {GROUP_ORDER.map((group) => {
          const rows = swapCandidates.filter((candidate) => candidate.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className="mb-2">
              <h4 className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {groupLabel[group]}
              </h4>
              <ul className="space-y-0.5">
                {rows.map((candidate) => (
                  <li key={candidate.player.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onSwap(candidate.player.id);
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-gray-100 active:scale-[0.99] dark:hover:bg-gray-700/60"
                    >
                      <PlayerAvatar
                        player={candidate.player}
                        asDiv
                        extrasmall
                        fullHideName
                        showName={false}
                        draggable={false}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {fullName(candidate.player)}
                        </span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                          {candidate.hint}
                        </span>
                      </span>
                      <Repeat2 size={16} className="shrink-0 text-gray-400" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </ActionSheet>
    );
  }

  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      modalId="lineup-player-sheet"
      title={fullName(player)}
      description={description}
      leading={leading}
      items={items}
    />
  );
};
