import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Archive,
  Loader2,
  MessagesSquare,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldQuestion,
  SquarePen,
  X,
} from 'lucide-react';
import type { AgentChatDto, AgentRunStatus } from '@shared/agentContract';
import { ChatListSkeletonRows } from '@/components/chat/ChatListLoadingSkeleton';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { AgentChatListView } from '@/features/agent/agentChatOrder';
import {
  agentChatMonthLabel,
  filterAgentChats,
  groupAgentChats,
  isUntouchedAgentChat,
  type AgentChatGroup,
} from '@/features/agent/agentChatGroups';
import { discardPrimedAgentVoiceAudio, primeAgentVoiceAudio } from '@/features/agent/voice/voiceAudioEngine';
import {
  useAgentChatsQuery,
  useCreateAgentChatMutation,
  useDeleteAgentChatMutation,
  useRenameAgentChatMutation,
  useSetAgentChatArchivedMutation,
  useSetAgentChatPinnedMutation,
} from '@/queries/agent/useAgentQueries';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { AgentChatMenuSheet, AgentDeleteChatDialog, AgentRenameDialog } from './AgentChatMenu';
import { AgentHomeHero } from './AgentHomeHero';
import { AgentGlyph } from './AgentGlyph';
import { AgentSuggestedPrompts } from './AgentSuggestedPrompts';
import { formatAgentChatTime } from './agentFormat';

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 10;

const previewText = (chat: AgentChatDto) => (chat.lastMessagePreview ? stripAgentRefTokens(chat.lastMessagePreview) : '');

export interface AgentOpenChatOptions {
  /** Sent by the chat view on arrival. */
  initialPrompt?: string;
  /** The chat view starts a voice conversation on arrival (audio unlocked in the tap here). */
  startVoice?: boolean;
}

interface AgentChatListProps {
  selectedChatId?: string | null;
  onOpenChat: (chatId: string, opts?: AgentOpenChatOptions) => void;
  /** Desktop split: fill the panel and scroll inside it. */
  fillHeight?: boolean;
}

export function AgentChatList({ selectedChatId = null, onOpenChat, fillHeight = false }: AgentChatListProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const locale = useMemo(() => resolveDisplaySettings(user).locale, [user]);
  const [view, setView] = useState<AgentChatListView>('main');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searching = searchOpen && query.trim().length > 0;
  const mainQuery = useAgentChatsQuery('main');
  // The archived list loads for its tab, and while searching (search covers both lists).
  const archivedCount = mainQuery.data?.archivedCount ?? 0;
  const archivedQuery = useAgentChatsQuery('archived', view === 'archived' || (searchOpen && archivedCount > 0));
  const chatsQuery = view === 'archived' ? archivedQuery : mainQuery;
  const createMutation = useCreateAgentChatMutation();
  const pinMutation = useSetAgentChatPinnedMutation();
  const archiveMutation = useSetAgentChatArchivedMutation();
  const deleteMutation = useDeleteAgentChatMutation();
  const renameMutation = useRenameAgentChatMutation();
  const [menuChat, setMenuChat] = useState<AgentChatDto | null>(null);
  const [renameChat, setRenameChat] = useState<AgentChatDto | null>(null);
  const [deleteChat, setDeleteChat] = useState<AgentChatDto | null>(null);

  // The switch only exists while something is archived; the last unarchive drops back to Chats.
  const showViewSwitch = archivedCount > 0 && !searchOpen;
  useEffect(() => {
    if (view === 'archived' && mainQuery.isSuccess && archivedCount === 0) setView('main');
  }, [view, mainQuery.isSuccess, archivedCount]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const [draft, setDraft] = useState('');
  const [voiceStarting, setVoiceStarting] = useState(false);

  /**
   * New chat (the server reuses an untouched one) and opens it: empty (suggestions + composer),
   * with a first message the chat view sends on arrival, or straight into a voice conversation.
   */
  const startChat = (opts: AgentOpenChatOptions = {}, onStarted?: () => void) => {
    if (createMutation.isPending) return;
    setVoiceStarting(Boolean(opts.startVoice));
    createMutation.mutate(undefined, {
      onSuccess: (chat) => {
        onStarted?.();
        onOpenChat(chat.id, opts.initialPrompt || opts.startVoice ? opts : undefined);
      },
      onError: (err) => {
        if (opts.startVoice) discardPrimedAgentVoiceAudio();
        toast.error(extractApiErrorMessage(err, t));
      },
    });
  };
  const startVoiceChat = () => {
    if (createMutation.isPending) return;
    // Inside the tap: iOS unlocks audio only here, the chat view takes the context over.
    primeAgentVoiceAudio();
    startChat({ startVoice: true });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  // Untouched New chats stay out of the list (the open one in the split view excepted).
  const chats = useMemo(
    () => (chatsQuery.data?.chats ?? []).filter((c) => c.id === selectedChatId || !isUntouchedAgentChat(c)),
    [chatsQuery.data, selectedChatId],
  );
  const groups = useMemo(() => groupAgentChats(chats, new Date(), { pinned: view === 'main' }), [chats, view]);
  const results = useMemo(() => {
    if (!searching) return [];
    const archived = archivedQuery.data?.chats ?? [];
    return [
      ...filterAgentChats(mainQuery.data?.chats ?? [], query, previewText),
      ...filterAgentChats(archived, query, previewText),
    ];
  }, [searching, query, mainQuery.data, archivedQuery.data]);
  const showSkeleton = chatsQuery.isPending && !searching;
  const isEmpty = chatsQuery.isSuccess && chats.length === 0;

  const groupLabel = (group: AgentChatGroup) => {
    if (group.kind === 'pinned') return t('agent.pinned');
    if (group.kind === 'month' && group.month) return agentChatMonthLabel(group.month, locale);
    return t(`agent.groups.${group.kind}`);
  };

  const renderRows = (rows: AgentChatDto[], opts: { archivedBadge?: boolean } = {}) => (
    <div className="mx-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {rows.map((chat) => (
        <AgentChatRow
          key={chat.id}
          chat={chat}
          selected={chat.id === selectedChatId}
          archivedBadge={Boolean(opts.archivedBadge && chat.archivedAt)}
          onOpen={() => onOpenChat(chat.id)}
          onMenu={() => setMenuChat(chat)}
        />
      ))}
    </div>
  );
  const sectionLabel = (label: string) => (
    <p className="px-4 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-400 first:pt-2 dark:text-gray-500">
      {label}
    </p>
  );

  return (
    <div className={fillHeight ? 'flex h-full min-h-0 flex-col' : 'flex flex-col'}>
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-violet-600 text-white shadow-md shadow-violet-500/25">
              <AgentGlyph size={18} />
            </span>
            <h2 className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">{t('agent.listTitle')}</h2>
          </div>
          <button
            type="button"
            onClick={() => startChat()}
            disabled={createMutation.isPending}
            aria-label={t('agent.newChat')}
            title={t('agent.newChat')}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
          >
            {createMutation.isPending ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <SquarePen size={20} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            aria-label={t('agent.search.open')}
            aria-pressed={searchOpen}
            title={t('agent.search.open')}
            className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              searchOpen
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700'
            }`}
          >
            <Search size={20} aria-hidden />
          </button>
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
        {searchOpen ? (
          <AgentChatSearchField
            inputRef={searchInputRef}
            value={query}
            onChange={setQuery}
            onClose={closeSearch}
          />
        ) : (
          <AgentHomeHero
            firstName={user?.firstName ?? null}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => startChat({ initialPrompt: draft.trim() }, () => setDraft(''))}
            onTalk={startVoiceChat}
            pending={createMutation.isPending}
            voicePending={createMutation.isPending && voiceStarting}
          />
        )}
        {showViewSwitch ? (
          <SegmentedSwitch
            tabs={[
              { id: 'main', label: t('agent.chatsTab'), icon: MessagesSquare },
              { id: 'archived', label: t('agent.archivedTab'), icon: Archive, badge: archivedCount },
            ]}
            activeId={view}
            onChange={(id) => setView(id as AgentChatListView)}
            showOnlyActiveTabText={false}
            badgeStyle="inline"
            fullWidth
            size="sm"
            layoutId="agentChatListView"
            ariaLabel={t('agent.listTitle')}
            className="mt-3"
          />
        ) : null}
      </div>

      <div className={fillHeight ? 'min-h-0 flex-1 overflow-y-auto pb-24' : ''}>
        {searching ? (
          results.length > 0 ? (
            <div className="pt-2">{renderRows(results, { archivedBadge: true })}</div>
          ) : archivedQuery.isFetching && !archivedQuery.data ? (
            <ChatListSkeletonRows />
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              <Search size={22} className="text-gray-300 dark:text-gray-600" aria-hidden />
              <p className="break-words" dir="auto">
                {t('agent.search.empty', { query: query.trim() })}
              </p>
            </div>
          )
        ) : (
          <>
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
            {isEmpty && view === 'main' ? (
              <AgentListEmptyState disabled={createMutation.isPending} onPick={(prompt) => startChat({ initialPrompt: prompt })} />
            ) : null}
            {!isEmpty && chatsQuery.isSuccess && view === 'main' ? (
              <section aria-label={t('agent.suggestionsTitle')} className="pb-1">
                {sectionLabel(t('agent.suggestionsTitle'))}
                <AgentSuggestedPrompts
                  layout="carousel"
                  disabled={createMutation.isPending}
                  onPick={(prompt) => startChat({ initialPrompt: prompt })}
                />
              </section>
            ) : null}
            {isEmpty && view === 'archived' ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('agent.archivedEmpty')}</p>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} aria-label={groupLabel(group)}>
                {sectionLabel(groupLabel(group))}
                {renderRows(group.chats)}
              </section>
            ))}
          </>
        )}
      </div>

      <AgentChatMenuSheet
        open={menuChat != null}
        title={menuChat?.title?.trim() || t('agent.newChat')}
        pinned={Boolean(menuChat?.pinnedAt)}
        archived={Boolean(menuChat?.archivedAt)}
        onClose={() => setMenuChat(null)}
        onRename={() => {
          setRenameChat(menuChat);
          setMenuChat(null);
        }}
        onTogglePin={() => {
          const target = menuChat;
          setMenuChat(null);
          if (!target) return;
          pinMutation.mutate(
            { chatId: target.id, pinned: !target.pinnedAt },
            { onError: (err) => toast.error(extractApiErrorMessage(err, t)) },
          );
        }}
        onToggleArchive={() => {
          const target = menuChat;
          setMenuChat(null);
          if (!target) return;
          const archived = !target.archivedAt;
          archiveMutation.mutate(
            { chatId: target.id, archived },
            {
              onSuccess: () => toast.success(t(archived ? 'agent.archived' : 'agent.unarchived')),
              onError: (err) => toast.error(extractApiErrorMessage(err, t)),
            },
          );
        }}
        onDelete={() => {
          setDeleteChat(menuChat);
          setMenuChat(null);
        }}
      />
      <AgentDeleteChatDialog
        open={deleteChat != null}
        title={deleteChat?.title?.trim() || t('agent.newChat')}
        deleting={deleteMutation.isPending}
        onClose={() => setDeleteChat(null)}
        onConfirm={() => {
          const target = deleteChat;
          if (!target) return;
          deleteMutation.mutate(
            { chatId: target.id, archived: Boolean(target.archivedAt) },
            {
              onSuccess: () => toast.success(t('agent.deleted')),
              onError: (err) => toast.error(extractApiErrorMessage(err, t)),
            },
          );
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
  /** Search results span both lists; archived rows say so. */
  archivedBadge?: boolean;
  onOpen: () => void;
  onMenu: () => void;
}

const AgentChatRow = memo(function AgentChatRow({ chat, selected, archivedBadge = false, onOpen, onMenu }: AgentChatRowProps) {
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
      className={`chat-list-row cursor-pointer select-none border-b border-gray-100 py-2.5 pe-2 ps-4 transition-colors last:border-b-0 dark:border-gray-800 ${
        selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-800'
      }`}
    >
      {/* Two lines, full width: title + time on top, status / preview + ⋯ below. The ⋯ sits
          under the time so it no longer steals width from the title. */}
      <div className="flex items-baseline gap-2 pe-1.5">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900 dark:text-white" dir="auto">
          {chat.title?.trim() || t('agent.newChat')}
        </h3>
        {archivedBadge ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1 self-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <Archive size={10} aria-hidden />
            {t('agent.search.archivedBadge')}
          </span>
        ) : null}
        <span className="flex-shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {formatAgentChatTime(chat.updatedAt, settings.locale, settings.hour12)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {running || queued ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">
            <AgentStatusDot status={status} />
            {t(running ? 'agent.status.working' : 'agent.status.queued')}
          </span>
        ) : awaiting ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <ShieldQuestion size={11} aria-hidden />
            {t('agent.status.needsConfirmation')}
          </span>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-[13px] text-gray-500 dark:text-gray-400" dir="auto">
          {previewText(chat) || t('agent.noMessagesYet')}
        </p>
        <button
          type="button"
          aria-label={t('agent.menu.open')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          className="-my-1 flex h-7 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <MoreHorizontal size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
});

/** Live-run marker in front of "Working…" / "Queued": pings while running, pulses while queued. */
function AgentStatusDot({ status }: { status?: AgentRunStatus }) {
  const color =
    status === 'RUNNING' ? 'bg-primary-500' : 'bg-primary-300 motion-safe:animate-pulse dark:bg-primary-700';
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
      {status === 'RUNNING' ? (
        <span className="absolute inset-0 rounded-full bg-primary-400 opacity-75 motion-safe:animate-ping" />
      ) : null}
      <span className={`relative h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function AgentListEmptyState({ onPick, disabled }: { onPick: (prompt: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 px-3 pb-6 pt-2">
      <p className="px-1 pb-1 text-sm text-gray-500 dark:text-gray-400">{t('agent.empty.listHint')}</p>
      <AgentSuggestedPrompts onPick={onPick} disabled={disabled} />
      <p className="px-1 pt-3 text-center text-xs text-gray-400 dark:text-gray-500">{t('agent.disclaimer')}</p>
    </div>
  );
}

/** Search across Chats and Archived (title + last message, case- and accent-insensitive). */
function AgentChatSearchField({
  inputRef,
  value,
  onChange,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="search"
      className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-gray-200 bg-white py-1.5 pe-1.5 ps-3.5 shadow-sm focus-within:border-primary-400 dark:border-gray-700 dark:bg-gray-800/80 dark:focus-within:border-primary-600"
    >
      <Search size={17} className="flex-shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={t('agent.search.placeholder')}
        aria-label={t('agent.search.open')}
        enterKeyHint="search"
        autoComplete="off"
        dir="auto"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="button"
        onClick={() => {
          if (value) {
            onChange('');
            inputRef.current?.focus();
          } else onClose();
        }}
        aria-label={value ? t('agent.search.clear') : t('common.close')}
        title={value ? t('agent.search.clear') : t('common.close')}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
