import { memo, useMemo, useRef, useState } from 'react';
import { stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Hourglass, Loader2, MoreHorizontal, Plus, ShieldCheck, ShieldQuestion, Sparkles } from 'lucide-react';
import type { AgentChatDto } from '@shared/agentContract';
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
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900 dark:text-white">{t('agent.listTitle')}</h2>
        <button
          type="button"
          onClick={openAgentPermissionsScreen}
          aria-label={t('agent.permissions.title')}
          title={t('agent.permissions.title')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ShieldCheck size={19} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => startChat()}
          disabled={createMutation.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {createMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Plus size={16} aria-hidden />
          )}
          {t('agent.newChat')}
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
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:rounded-none md:border-x-0 md:border-b-0">
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
      className={`chat-list-row flex cursor-pointer select-none items-center gap-3 border-b border-gray-200 p-3 transition-colors last:border-b-0 dark:border-gray-700 ${
        selected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-800'
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-white">
          <Sparkles size={22} aria-hidden />
        </div>
        {running ? (
          <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-gray-900">
            <Loader2 size={12} className="animate-spin text-primary-600 dark:text-primary-400" aria-hidden />
          </span>
        ) : queued ? (
          <span className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-gray-900">
            <Hourglass size={11} className="animate-pulse text-primary-600 dark:text-primary-400" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
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
          <p className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
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

function AgentListEmptyState({ onPick, disabled }: { onPick: (prompt: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg">
        <Sparkles size={30} aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-white">{t('agent.empty.listTitle')}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('agent.empty.listHint')}</p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-2">
        {AGENT_EXAMPLE_PROMPT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t(key))}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-start text-sm text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            dir="auto"
          >
            {t(key)}
          </button>
        ))}
      </div>
      <p className="max-w-md text-xs text-gray-400 dark:text-gray-500">{t('agent.disclaimer')}</p>
    </div>
  );
}
