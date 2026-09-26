import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, MoreHorizontal } from 'lucide-react';
import { ActionSheet, type ActionSheetItem } from '@/components/gameResults/ActionSheet';

interface ResultsActionsMenuProps {
  showEdit: boolean;
  disabled: boolean;
  onEdit: () => void;
}

/**
 * "Edit results" (after finishing) — a rare, weighty action kept off the main
 * path. Restart is not here: while scoring it sits in the sticky footer bar.
 */
export const ResultsActionsMenu = ({ showEdit, disabled, onEdit }: ResultsActionsMenuProps) => {
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
    return list;
  }, [showEdit, disabled, onEdit, t]);

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
