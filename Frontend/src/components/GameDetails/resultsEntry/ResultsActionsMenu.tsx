import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, MoreHorizontal, RotateCcw } from 'lucide-react';
import { Game } from '@/types';
import { getRestartText } from '@/utils/gameResultsHelpers';
import { ActionSheet, type ActionSheetItem } from '@/components/gameResults/ActionSheet';

interface ResultsActionsMenuProps {
  currentGame: Game | null;
  showEdit: boolean;
  showRestart: boolean;
  disabled: boolean;
  onEdit: () => void;
  onRestart: () => void;
}

/** "Edit results" (after finishing) and "Restart" — rare, weighty actions kept off the main path. */
export const ResultsActionsMenu = ({
  currentGame,
  showEdit,
  showRestart,
  disabled,
  onEdit,
  onRestart,
}: ResultsActionsMenuProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const items = useMemo<ActionSheetItem[]>(() => {
    const list: ActionSheetItem[] = [];
    if (showEdit) {
      list.push({
        id: 'edit',
        label: t('gameResults.editResults'),
        icon: Edit,
        afterClose: true,
        disabled,
        onSelect: onEdit,
      });
    }
    if (showRestart) {
      list.push({
        id: 'restart',
        label: getRestartText(currentGame, t),
        icon: RotateCcw,
        tone: 'danger',
        afterClose: true,
        disabled,
        onSelect: onRestart,
      });
    }
    return list;
  }, [showEdit, showRestart, disabled, onEdit, onRestart, currentGame, t]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('gameResults.resultsActions')}
        title={t('gameResults.resultsActions')}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:scale-95 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <MoreHorizontal size={20} aria-hidden />
      </button>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        modalId="results-actions"
        title={t('gameResults.resultsActions')}
        items={items}
      />
    </>
  );
};
