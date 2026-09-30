import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import type { AgentToolPermissionDto } from '@shared/agentContract';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import {
  useAgentPermissionsQuery,
  useAgentPermissionsScreenStore,
  useResetAgentPermissionsMutation,
  useSetAgentPermissionMutation,
} from '@/queries/agent/useAgentPermissions';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';

/**
 * "Assistant permissions" (plan §15): Ask ↔ Always allow per write tool. Critical tools are
 * locked to Ask. Mounted once per AI surface; opened through `openAgentPermissionsScreen()`.
 */
export function AgentPermissionsScreen() {
  const open = useAgentPermissionsScreenStore((s) => s.open);
  const setOpen = useAgentPermissionsScreenStore((s) => s.setOpen);
  return <AgentPermissionsDialog open={open} onClose={() => setOpen(false)} />;
}

export function AgentPermissionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useAgentPermissionsQuery(open);
  const setMutation = useSetAgentPermissionMutation();
  const resetMutation = useResetAgentPermissionsMutation();
  const [confirmReset, setConfirmReset] = useState(false);
  const tools = query.data ?? [];
  const anyAllowed = tools.some((tool) => tool.mode === 'ALWAYS_ALLOW');

  const toggle = (tool: AgentToolPermissionDto, allow: boolean) => {
    setMutation.mutate(
      { toolName: tool.toolName, mode: allow ? 'ALWAYS_ALLOW' : 'ASK' },
      { onError: (err) => toast.error(extractApiErrorMessage(err, t)) },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} modalId="agent-permissions-dialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agent.permissions.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4">
          <p className="flex items-start gap-2 rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
            <ShieldCheck size={15} className="mt-px flex-shrink-0" aria-hidden />
            <span>{t('agent.permissions.safetyNote')}</span>
          </p>

          {query.isPending ? (
            <div className="flex justify-center py-8 text-gray-400">
              <Loader2 size={20} className="animate-spin" aria-hidden />
            </div>
          ) : null}
          {query.isError ? (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              <p>{t('agent.permissions.loadFailed')}</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-3 rounded-full border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}
          {query.isSuccess && tools.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('agent.permissions.empty')}</p>
          ) : null}

          {tools.length > 0 ? (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-gray-700/70 dark:border-gray-700">
              {tools.map((tool) => (
                <AgentPermissionRow key={tool.toolName} tool={tool} onToggle={toggle} />
              ))}
            </ul>
          ) : null}

          {tools.length > 0 ? (
            <button
              type="button"
              disabled={!anyAllowed || resetMutation.isPending}
              onClick={() => setConfirmReset(true)}
              className="h-11 rounded-xl border border-gray-200 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {t('agent.permissions.resetAll')}
            </button>
          ) : null}
        </div>
      </DialogContent>

      <ConfirmationModal
        isOpen={confirmReset}
        title={t('agent.permissions.resetTitle')}
        message={t('agent.permissions.resetMessage')}
        confirmText={t('agent.permissions.resetConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={resetMutation.isPending}
        onClose={() => setConfirmReset(false)}
        onConfirm={() =>
          resetMutation.mutate(undefined, {
            onSuccess: () => toast.success(t('agent.permissions.resetDone')),
            onError: (err) => toast.error(extractApiErrorMessage(err, t)),
          })
        }
      />
    </Dialog>
  );
}

function AgentPermissionRow({
  tool,
  onToggle,
}: {
  tool: AgentToolPermissionDto;
  onToggle: (tool: AgentToolPermissionDto, allow: boolean) => void;
}) {
  const { t } = useTranslation();
  const allowed = tool.canAlwaysAllow && tool.mode === 'ALWAYS_ALLOW';
  const switchId = `agent-permission-${tool.toolName}`;
  return (
    <li className="flex items-center gap-3 px-3 py-3" data-testid={switchId}>
      <label htmlFor={switchId} className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 dark:text-white" dir="auto">
          {tool.name}
        </span>
        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400" dir="auto">
          {tool.description}
        </span>
        <span
          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
            allowed ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {tool.canAlwaysAllow ? null : <Lock size={11} aria-hidden />}
          {tool.canAlwaysAllow
            ? allowed
              ? t('agent.permissions.modeAlways')
              : t('agent.permissions.modeAsk')
            : t('agent.permissions.alwaysAsks')}
        </span>
      </label>
      <ToggleSwitch
        id={switchId}
        checked={allowed}
        disabled={!tool.canAlwaysAllow}
        onChange={(next) => onToggle(tool, next)}
      />
    </li>
  );
}
