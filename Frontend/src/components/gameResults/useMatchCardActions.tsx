import { useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, MoreHorizontal, Play, PlusSquare, Trash2, Users } from 'lucide-react';
import { ConfirmationModal } from '@/components';
import { ActionSheet, type ActionSheetItem } from './ActionSheet';

export const livePlayPath = (gameId: string, matchId: string) =>
  `/games/${gameId}/live?matchId=${encodeURIComponent(matchId)}`;

const stop = (e: MouseEvent) => e.stopPropagation();

interface MatchCardActionsParams {
  matchId: string;
  matchIndex: number;
  isEditing: boolean;
  courtName?: string | null;
  canEditLineup: boolean;
  onEditLineup?: () => void;
  canChangeCourt: boolean;
  onChangeCourt?: () => void;
  liveGameId?: string | null;
  canAddExtraSet: boolean;
  onAddExtraSet?: () => void;
  canDelete: boolean;
  onDelete: () => void;
}

/**
 * The ⋯ menu of a match card and the confirmation behind "Delete match".
 * Returns nothing to render when the viewer has no action on this match.
 */
export function useMatchCardActions({
  matchId,
  matchIndex,
  isEditing,
  courtName,
  canEditLineup,
  onEditLineup,
  canChangeCourt,
  onChangeCourt,
  liveGameId,
  canAddExtraSet,
  onAddExtraSet,
  canDelete,
  onDelete,
}: MatchCardActionsParams) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const matchLabel = t('gameResults.match', { number: matchIndex + 1 });

  const items = useMemo<ActionSheetItem[]>(() => {
    const list: ActionSheetItem[] = [];
    if (canEditLineup && onEditLineup) {
      list.push({ id: 'lineup', label: t('gameResults.editLineup'), icon: Users, onSelect: onEditLineup });
    }
    if (canChangeCourt && onChangeCourt) {
      list.push({
        id: 'court',
        label: t('gameResults.changeCourt'),
        hint: courtName ?? null,
        icon: MapPin,
        afterClose: true,
        onSelect: onChangeCourt,
      });
    }
    if (liveGameId) {
      list.push({
        id: 'live',
        label: t('gameResults.liveScore'),
        icon: Play,
        onSelect: () => navigate(livePlayPath(liveGameId, matchId)),
      });
    }
    if (canAddExtraSet && onAddExtraSet) {
      list.push({
        id: 'extra',
        label: t('gameResults.addExtraSet'),
        hint: t('gameResults.extraSetHint'),
        icon: PlusSquare,
        afterClose: true,
        onSelect: onAddExtraSet,
      });
    }
    if (canDelete) {
      list.push({
        id: 'delete',
        label: t('gameResults.deleteMatch'),
        icon: Trash2,
        tone: 'danger',
        afterClose: true,
        onSelect: () => setConfirmDelete(true),
      });
    }
    return list;
  }, [
    canEditLineup,
    onEditLineup,
    canChangeCourt,
    onChangeCourt,
    courtName,
    liveGameId,
    canAddExtraSet,
    onAddExtraSet,
    canDelete,
    matchId,
    navigate,
    t,
  ]);

  const menuButton =
    items.length > 0 && !isEditing ? (
      <button
        type="button"
        aria-label={t('gameResults.matchActions')}
        title={t('gameResults.matchActions')}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(true);
        }}
        className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:scale-95 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200"
      >
        <MoreHorizontal size={20} aria-hidden />
      </button>
    ) : null;

  const overlays = (
    <span className="contents" onClick={stop}>
      <ActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        modalId={`match-actions-${matchId}`}
        title={matchLabel}
        description={courtName ?? null}
        items={items}
      />
      {confirmDelete ? (
        <ConfirmationModal
          isOpen
          title={t('gameResults.deleteMatch')}
          message={t('gameResults.deleteMatchConfirmation')}
          highlightedText={matchLabel}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </span>
  );

  return { menuButton, overlays };
}
