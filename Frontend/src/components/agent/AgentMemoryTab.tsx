import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  AGENT_MEMORY_BODY_MAX_LENGTH,
  AGENT_MEMORY_MAX_ITEMS,
  type AgentMemoryDto,
} from '@shared/agentContract';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  memoryRestoreOf,
  useAddAgentMemoryMutation,
  useAgentMemoryQuery,
  useClearAgentMemoryMutation,
  useDeleteAgentMemoryMutation,
  useSetAgentMemoryEnabledMutation,
  useUpdateAgentMemoryMutation,
} from '@/queries/agent/useAgentMemory';
import { agentMemoryErrorMessage } from './agentMemoryErrors';

/**
 * Memory tab of "Assistant settings" (Phase 11):
 * the Allow memory switch with the disclosure, the list (dimmed while OFF; delete always,
 * edit only while ON), Remove all, and the Add form pinned at the bottom of the dialog. The
 * dialog is `cap-keyboard-aware-dialog`, so with the software keyboard up it sits on the
 * visual viewport and the form stays above the keyboard; the list scrolls above it.
 */
export function AgentMemoryTab({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const query = useAgentMemoryQuery(active);
  const setEnabled = useSetAgentMemoryEnabledMutation();
  const addMutation = useAddAgentMemoryMutation();
  const deleteMutation = useDeleteAgentMemoryMutation();
  const clearMutation = useClearAgentMemoryMutation();
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const enabled = query.data?.enabled ?? false;
  const items = query.data?.items ?? [];
  const full = items.length >= AGENT_MEMORY_MAX_ITEMS;

  const remove = (item: AgentMemoryDto) => {
    if (editingId === item.id) setEditingId(null);
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        toast.custom(
          (toastApi) => (
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-gray-900 py-2 pe-2 ps-4 text-sm text-white shadow-lg dark:bg-gray-700">
              <span className="min-w-0 truncate">{t('agent.memory.deleted')}</span>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(toastApi.id);
                  addMutation.mutate(memoryRestoreOf(item), {
                    onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
                  });
                }}
                className="h-9 shrink-0 rounded-xl px-3 font-semibold text-primary-300 transition-colors hover:bg-white/10"
              >
                {t('agent.memory.undo')}
              </button>
            </div>
          ),
          { duration: 5000 },
        );
      },
      onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
    });
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="agent-memory-tab">
        <div className="rounded-2xl border border-gray-200 px-3 py-3 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <label htmlFor="agent-memory-enabled" className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('agent.memory.allow')}</span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{t('agent.memory.allowHint')}</span>
            </label>
            <ToggleSwitch
              id="agent-memory-enabled"
              checked={enabled}
              disabled={!query.isSuccess}
              onChange={(next) =>
                setEnabled.mutate(next, { onError: (err) => toast.error(agentMemoryErrorMessage(err, t)) })
              }
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{t('agent.memory.disclosure')}</p>
        </div>

        {query.isSuccess && !enabled ? (
          <p className="rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {t('agent.memory.offNote')}
          </p>
        ) : null}

        {query.isPending ? (
          <div className="flex justify-center py-8 text-gray-400">
            <Loader2 size={20} className="animate-spin" aria-hidden />
          </div>
        ) : null}
        {query.isError ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>{t('agent.memory.loadFailed')}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 rounded-full border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        {query.isSuccess && items.length === 0 ? <AgentMemoryEmpty /> : null}

        {items.length > 0 ? (
          <>
            <ul
              className={`divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 transition-opacity dark:divide-gray-700/70 dark:border-gray-700 ${
                enabled ? '' : 'opacity-60'
              }`}
            >
              {items.map((item) => (
                <AgentMemoryRow
                  key={item.id}
                  item={item}
                  canEdit={enabled}
                  editing={editingId === item.id}
                  onEdit={(open) => setEditingId(open ? item.id : null)}
                  onDelete={() => remove(item)}
                />
              ))}
            </ul>
            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
              {t('agent.memory.limit', { count: items.length, max: AGENT_MEMORY_MAX_ITEMS })}
            </p>
          </>
        ) : null}

        {query.isSuccess ? (
          <button
            type="button"
            disabled={items.length === 0 || clearMutation.isPending}
            onClick={() => setConfirmClear(true)}
            className="h-11 flex-shrink-0 rounded-xl border border-gray-200 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {t('agent.memory.removeAll')}
          </button>
        ) : null}
      </div>

      {query.isSuccess ? <AgentMemoryAddForm disabled={!enabled || full} /> : null}

      <ConfirmationModal
        isOpen={confirmClear}
        title={t('agent.memory.removeAllTitle')}
        message={t('agent.memory.removeAllMessage')}
        confirmText={t('agent.memory.removeAllConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={clearMutation.isPending}
        onClose={() => setConfirmClear(false)}
        onConfirm={() =>
          clearMutation.mutate(undefined, {
            onSuccess: () => toast.success(t('agent.memory.removedAll')),
            onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
          })
        }
      />
    </>
  );
}

function AgentMemoryEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-4 text-center" data-testid="agent-memory-empty">
      <Brain size={22} className="text-gray-400" aria-hidden />
      <p className="text-sm font-medium text-gray-900 dark:text-white">{t('agent.memory.emptyTitle')}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('agent.memory.emptyHint')}</p>
      <ul className="mt-1 flex w-full flex-col gap-1.5">
        {(['agent.memory.example1', 'agent.memory.example2'] as const).map((key) => (
          <li
            key={key}
            className="rounded-xl border border-dashed border-gray-300 px-3 py-2 text-start text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300"
          >
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentMemoryRow({
  item,
  canEdit,
  editing,
  onEdit,
  onDelete,
}: {
  item: AgentMemoryDto;
  canEdit: boolean;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const updateMutation = useUpdateAgentMemoryMutation();
  const [draft, setDraft] = useState(item.body);

  const save = () => {
    const text = draft.trim();
    if (!text || text === item.body) {
      onEdit(false);
      return;
    }
    updateMutation.mutate(
      { id: item.id, text },
      {
        onSuccess: () => {
          onEdit(false);
          toast.success(t('agent.memory.saved'));
        },
        onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
      },
    );
  };

  return (
    <li className="px-3 py-3" data-testid={`agent-memory-item-${item.id}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            if (!editing) setDraft(item.body);
            onEdit(!editing);
          }}
          aria-label={t('agent.memory.edit')}
          aria-expanded={editing}
          className="min-w-0 flex-1 text-start disabled:cursor-default"
        >
          <span className="block text-sm font-medium text-gray-900 dark:text-white" dir="auto">
            {item.description}
          </span>
          {item.body !== item.description ? (
            <span className="mt-0.5 line-clamp-2 block text-xs text-gray-500 dark:text-gray-400" dir="auto">
              {item.body}
            </span>
          ) : null}
          <span
            className={`mt-1 inline-block rounded-full px-1.5 py-px text-[10px] font-medium ${
              item.source === 'USER_ASKED'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {item.source === 'USER_ASKED' ? t('agent.memory.badgeUser') : t('agent.memory.badgeLearned')}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('agent.memory.delete')}
          className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <MemoryTextField
              value={draft}
              onChange={setDraft}
              onSubmit={save}
              onCancel={() => onEdit(false)}
              pending={updateMutation.isPending}
              autoFocus
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function AgentMemoryAddForm({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const addMutation = useAddAgentMemoryMutation();
  const [openState, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Turning memory off (or reaching the cap) folds the form.
  const open = openState && !disabled;

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    addMutation.mutate(
      { text: value },
      {
        onSuccess: () => {
          setText('');
          setOpen(false);
          toast.success(t('agent.memory.saved'));
        },
        onError: (err) => toast.error(agentMemoryErrorMessage(err, t)),
      },
    );
  };

  return (
    <div
      className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 dark:border-gray-800"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      data-testid="agent-memory-add"
    >
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="form"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <MemoryTextField
              value={text}
              onChange={setText}
              onSubmit={submit}
              onCancel={() => setOpen(false)}
              pending={addMutation.isPending}
              placeholder={t('agent.memory.addPlaceholder')}
              autoFocus
            />
          </motion.div>
        ) : (
          <motion.button
            key="button"
            type="button"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary-600 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
          >
            <Plus size={16} aria-hidden />
            {t('agent.memory.add')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function MemoryTextField({
  value,
  onChange,
  onSubmit,
  onCancel,
  pending,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // After the open animation starts, so the keyboard lifts the dialog with the field in it.
    const timer = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);
  const left = AGENT_MEMORY_BODY_MAX_LENGTH - value.length;
  return (
    <div className="flex flex-col gap-2 pt-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, AGENT_MEMORY_BODY_MAX_LENGTH))}
        maxLength={AGENT_MEMORY_BODY_MAX_LENGTH}
        rows={3}
        dir="auto"
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-primary-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
      <div className="flex items-center gap-2">
        <span
          className={`me-auto text-[11px] tabular-nums ${left < 40 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`}
          aria-live="polite"
        >
          {value.length}/{AGENT_MEMORY_BODY_MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-xl px-3 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !value.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          {t('agent.memory.save')}
        </button>
      </div>
    </div>
  );
}
