import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { QUICK_SHORTCUT_ACTIONS, type QuickShortcutAction } from './findQuickShortcuts';

interface FindQuickShortcutsRowProps {
  /** The option the calendar currently shows (`resolveActiveQuickShortcut`). */
  activeKind: QuickShortcutAction | null;
  onSelect: (action: QuickShortcutAction) => void;
  /** The highlighted option was tapped again. */
  onClear: () => void;
  className?: string;
}

const LABEL_DEFAULTS: Record<QuickShortcutAction, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  weekend: 'Weekend',
};

/**
 * PRD 358 — Today · Tomorrow · Weekend inside the Find calendar heading. A
 * preset over existing Find state, rendered with the house segmented control:
 * one line, 44 px targets, arrow keys, RTL-aware.
 */
const FindQuickShortcutsRowView = ({
  activeKind,
  onSelect,
  onClear,
  className,
}: FindQuickShortcutsRowProps) => {
  const { t } = useTranslation();

  const tabs = useMemo<SegmentedSwitchTab[]>(
    () =>
      QUICK_SHORTCUT_ACTIONS.map((action) => ({
        id: action,
        label: t(`games.quickShortcuts.${action}`, { defaultValue: LABEL_DEFAULTS[action] }),
      })),
    [t],
  );

  return (
    <SegmentedSwitch
      tabs={tabs}
      allowDeselect
      activeId={activeKind}
      onChange={(id) => {
        if (id == null) {
          onClear();
          return;
        }
        onSelect(id as QuickShortcutAction);
      }}
      showOnlyActiveTabText={false}
      layoutId="find-quick-shortcuts"
      ariaLabel={t('games.quickShortcuts.ariaLabel', { defaultValue: 'Day shortcuts' })}
      fullWidth
      size="sm"
      labelOverflow="scroll"
      // 44 px targets: the row is 48 px tall and every tab stretches to fill it.
      className={`min-h-[48px] ${className ?? ''}`.trim()}
    />
  );
};

export const FindQuickShortcutsRow = memo(FindQuickShortcutsRowView);
