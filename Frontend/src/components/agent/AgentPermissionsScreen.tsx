import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useAgentPermissionsScreenStore, type AgentSettingsTab } from '@/queries/agent/useAgentPermissions';
import { AgentMemoryTab } from './AgentMemoryTab';
import { AgentPermissionsTab } from './AgentPermissionsTab';

/**
 * "Assistant settings" (plan §15 + Phase 11 memory): Permissions and Memory tabs. Mounted
 * once per AI surface; opened through `openAgentPermissionsScreen(initialTab?)`.
 */
export function AgentPermissionsScreen() {
  const open = useAgentPermissionsScreenStore((s) => s.open);
  const tab = useAgentPermissionsScreenStore((s) => s.tab);
  const setOpen = useAgentPermissionsScreenStore((s) => s.setOpen);
  const setTab = useAgentPermissionsScreenStore((s) => s.setTab);
  return <AgentPermissionsDialog open={open} tab={tab} onTabChange={setTab} onClose={() => setOpen(false)} />;
}

export function AgentPermissionsDialog({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean;
  tab: AgentSettingsTab;
  onTabChange: (tab: AgentSettingsTab) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'permissions', label: t('agent.settings.tabPermissions') },
      { id: 'memory', label: t('agent.settings.tabMemory') },
    ],
    [t],
  );

  return (
    <Dialog open={open} onClose={onClose} modalId="agent-permissions-dialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agent.settings.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex-shrink-0 px-4 pt-3">
          <SegmentedSwitch
            tabs={tabs}
            activeId={tab}
            onChange={(id) => onTabChange(id === 'memory' ? 'memory' : 'permissions')}
            showOnlyActiveTabText={false}
            layoutId="agent-settings-tab"
            fullWidth
            size="sm"
            ariaLabel={t('agent.settings.title')}
          />
        </div>
        {tab === 'memory' ? <AgentMemoryTab active={open} /> : <AgentPermissionsTab active={open} />}
      </DialogContent>
    </Dialog>
  );
}
