import { memo, useMemo, useRef, useState } from 'react';
import { stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowUpRight, Loader2, MoreHorizontal, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { AgentChatDto, AgentRunStatus } from '@shared/agentContract';
import { ChatListSkeletonRows } from '@/components/chat/ChatListLoadingSkeleton';
import {
  useAgentChatsQuery,
  useArchiveAgentChatMutation,
  useCreateAgentChatMutation,
  useRenameAgentChatMutation,
} from '@/queries/agent/useAgentQueries';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { AgentChatMenuSheet, AgentRenameDialog } from './AgentChatMenu';
import { AgentGlyph } from './AgentGlyph';
import { AGENT_EXAMPLE_PROMPT_KEYS } from './agentExamplePrompts';
import { formatAgentChatTime } from './agentFormat';

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 10;

interface AgentChatListProps {
  selectedChatId?: string | null;
  onOpenChat: (chatId: string, opts?: { initialPrompt?: string }) => void;
  /** Desktop split: fill the panel and scroll inside it. */
  fillHeight?: boolean;
}

export function AgentChatList({ selectedChatId = null, onOpenChat, fillHeight = false }: AgentChatListProps) {
  const { t } = useTranslation();
  const chatsQuery = useAgentChatsQuery();
  const createMutation = useCreateAgentChatMutation();
  const archiveMutation = useArchiveAgentChatMutation();
  const renameMutation = useRenameAgentChatMutation();
  const [menuChat, setMenuChat] = useState<AgentChatDto | null>(null);
  const [renameChat, setRenameChat] = useState<AgentChatDto | null>(null);

  const startChat = (initialPrompt?: string) => {
    if (createMutation.isPending) return;
    createMutation.mutate(undefined, {
      onSuccess: (chat) => onOpenChat(chat.id, initialPrompt ? { initialPrompt } : undefined),
      onError: (err) => toast.error(extractApiErrorMessage(err, t)),
    });
  };

  const chats = chatsQuery.data ?? [];
  const showSkeleton = chatsQuery.isPending;
  const isEmpty = chatsQuery.isSuccess && chats.length === 0;

  return (
    <div className={fillHeight ? 'flex h-full min-h-0 flex-col' : 'flex flex-col'}>
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-violet-600 text-white shadow-lg shadow-violet-500/25 dark:shadow-violet-900/40">
            <AgentGlyph size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              {t('agent.listTitle')}
            </p>
            <h2 className="truncate text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-white">
              {t('agent.empty.listTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => openAgentPermissionsScreen()}
            aria-label={t('agent.settings.title')}
            title={t('agent.settings.title')}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            <ShieldCheck size={20} aria-hidden />
          </button>
        </div>
        {/* Starts a new chat; reads as the composer so the next step is obvious. */}
        <button
          type="button"
          onClick={() => startChat()}
          disabled={createMutation.isPending}
          aria-label={t('agent.newChat')}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white py-1.5 pe-1.5 ps-4 text-start shadow-sm transition-colors hover:border-primary-300 active:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-primary-700 dark:active:bg-gray-800"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-gray-400 dark:text-gray-500">
            {t('agent.composer.placeholder')}
          </span>
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
            {createMutation.isPending ? (
              <Loader2 size={17} className="animate-spin" aria-hidden />
            ) : (
              <ArrowUp size={18} aria-hidden />
            )}
          </span>
        </button>
      </div>

      <div className={fillHeight ? 'min-h-0 flex-1 overflow-y-auto pb-24' : ''}>
        {showSkeleton ? <ChatListSkeletonRows /> : null}
        {chatsQuery.isError ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>{t('agent.errors.listFailed')}</p>
            <button
              type="button"
              onClick={() => void chatsQuery.refetch()}
              className="mt-3 rounded-full border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}
        {isEmpty ? (
          <AgentListEmptyState disabled={createMutation.isPending} onPick={(prompt) => startChat(prompt)} />
        ) : null}
        {chats.length > 0 ? (
          <>
            <p className="px-4 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t('agent.recent')}
            </p>
            <div className="mx-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {chats.map((chat) => (
                <AgentChatRow
                  key={chat.id}
                  chat={chat}
                  selected={chat.id === selectedChatId}
                  onOpen={() => onOpenChat(chat.id)}
                  onMenu={() => setMenuChat(chat)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <AgentChatMenuSheet
        open={menuChat != null}
        title={menuChat?.title?.trim() || t('agent.newChat')}
        onClose={() => setMenuChat(null)}
        onRename={() => {
          setRenameChat(menuChat);
          setMenuChat(null);
        }}
        onArchive={() => {
          const target = menuChat;
          setMenuChat(null);
          if (!target) return;
          archiveMutation.mutate(target.id, {
            onSuccess: () => toast.success(t('agent.archived')),
            onError: (err) => toast.error(extractApiErrorMessage(err, t)),
          });
        }}
      />
      <AgentRenameDialog
        open={renameChat != null}
        initialTitle={renameChat?.title ?? ''}
        saving={renameMutation.isPending}
        onClose={() => setRenameChat(null)}
        onSave={(title) => {
          if (!renameChat) return;
          renameMutation.mutate(
            { chatId: renameChat.id, title },
            {
              onSuccess: () => setRenameChat(null),
              onError: (err) => toast.error(extractApiErrorMessage(err, t)),
            },
          );
        }}
      />
    </div>
  );
}

interface AgentChatRowProps {
  chat: AgentChatDto;
  selected: boolean;
  onOpen: () => void;
  onMenu: () => void;
}

const AgentChatRow = memo(function AgentChatRow({ chat, selected, onOpen, onMenu }: AgentChatRowProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };

  const status = chat.activeRun?.status;
  const running = status === 'RUNNING';
  const queued = status === 'QUEUED';
  const awaiting = status === 'AWAITING_CONFIRMATION';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu();
      }}
      onPointerDown={(e) => {
        longPressed.current = false;
        pressStart.current = { x: e.clientX, y: e.clientY };
        pressTimer.current = setTimeout(() => {
          longPressed.current = true;
          clearPress();
          onMenu();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const start = pressStart.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_MOVE_PX) clearPress();
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      className={`chat-list-row flex cursor-pointer select-none items-center gap-3 border-b border-gray-100 py-3 pe-2 ps-4 transition-colors last:border-b-0 dark:border-gray-800 ${
        selected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-800'
      }`}
    >
      <AgentStatusDot status={status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold text-gray-900 dark:text-white" dir="auto">
            {chat.title?.trim() || t('agent.newChat')}
          </h3>
          <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {formatAgentChatTime(chat.updatedAt, settings.locale, settings.hour12)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {running ? (
            <span className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400">
              {t('agent.status.working')}
            </span>
          ) : queued ? (
            <span className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400">
              {t('agent.status.queued')}
            </span>
          ) : awaiting ? (
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <ShieldQuestion size={11} aria-hidden />
              {t('agent.status.needsConfirmation')}
            </span>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[13px] text-gray-500 dark:text-gray-400" dir="auto">
            {chat.lastMessagePreview ? stripAgentRefTokens(chat.lastMessagePreview) : t('agent.noMessagesYet')}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label={t('agent.menu.open')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onMenu();
        }}
        className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
    </div>
  );
});

const STATUS_DOT_LABEL_KEYS: Partial<Record<AgentRunStatus, string>> = {
  RUNNING: 'agent.status.working',
  QUEUED: 'agent.status.queued',
  AWAITING_CONFIRMATION: 'agent.status.needsConfirmation',
};

/** Leading status marker for a chat row: working (pulse), queued, needs OK, or idle. */
function AgentStatusDot({ status }: { status?: AgentRunStatus }) {
  const { t } = useTranslation();
  const labelKey = status ? STATUS_DOT_LABEL_KEYS[status] : undefined;
  const color =
    status === 'RUNNING'
      ? 'bg-primary-500'
      : status === 'QUEUED'
        ? 'bg-primary-300 motion-safe:animate-pulse dark:bg-primary-700'
        : status === 'AWAITING_CONFIRMATION'
          ? 'bg-amber-500'
          : 'bg-gray-300 dark:bg-gray-600';
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0" title={labelKey ? t(labelKey) : undefined}>
      {status === 'RUNNING' ? (
        <span
          className="absolute inset-0 rounded-full bg-primary-400 opacity-75 motion-safe:animate-ping"
          aria-hidden
        />
      ) : null}
      <span className={`relative h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
    </span>
  );
}

function AgentListEmptyState({ onPick, disabled }: { onPick: (prompt: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 px-3 pb-6 pt-2">
      <p className="px-1 pb-1 text-sm text-gray-500 dark:text-gray-400">{t('agent.empty.listHint')}</p>
      {AGENT_EXAMPLE_PROMPT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(t(key))}
          className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-start text-sm font-medium text-gray-800 transition-colors hover:border-primary-300 active:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-primary-700 dark:active:bg-gray-800"
          dir="auto"
        >
          <span className="min-w-0 flex-1">{t(key)}</span>
          <ArrowUpRight
            size={16}
            className="flex-shrink-0 text-gray-400 transition-colors group-hover:text-primary-500 rtl:-scale-x-100"
            aria-hidden
          />
        </button>
      ))}
      <p className="px-1 pt-3 text-center text-xs text-gray-400 dark:text-gray-500">{t('agent.disclaimer')}</p>
    </div>
  );
}
