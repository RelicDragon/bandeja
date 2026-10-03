import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Hourglass, MoreHorizontal, RotateCcw, Sparkles, X } from 'lucide-react';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { getBackAction } from '@/utils/backNavigation';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import {
  useAgentChatQuery,
  useCancelAgentRunMutation,
  useDeleteAgentChatMutation,
  useCreateAgentChatMutation,
  useConfirmAgentActionMutation,
  confirmVarsActionId,
  type ConfirmAgentActionVars,
  useRejectAgentActionMutation,
  useRenameAgentChatMutation,
  useSetAgentChatArchivedMutation,
  useSetAgentChatPinnedMutation,
  useSendAgentMessageMutation,
} from '@/queries/agent/useAgentQueries';
import { useAgentStream } from '@/features/agent/useAgentStream';
import { agentRunIdToAttach } from '@/features/agent/agentRunAttach';
import { useAgentRun } from '@/features/agent/agentRunStore';
import { isTerminalPhase } from '@/features/agent/agentRunReducer';
import { isLiveAgentRunStatus } from '@/features/agent/agentChatsPolling';
import { buildAgentTimeline, groupAgentTimeline, type AgentRenderItem } from '@/features/agent/agentTimeline';
import { agentErrorCodeOf, agentErrorKey } from '@/features/agent/agentErrors';
import { AgentSendContext, type AgentSendApi } from '@/features/agent/agentSendContext';
import { agentRefToken, parseAgentRefTokens, stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { agentMarkdownToPlainText } from '@/features/agent/agentMessageShare';
import type { AgentErrorCode } from '@shared/agentContract';
import { AgentComposer } from './AgentComposer';
import { AgentMarkdown } from './AgentMarkdown';
import { AgentMessageActions, AgentMessageEditor } from './AgentMessageActions';
import { AgentToolGroup } from './AgentToolGroup';
import { AgentActionCard } from './AgentActionCard';
import { AgentClientActionCard } from './AgentClientActionCard';
import { useAgentClientExecution, useAgentClientResume } from '@/queries/agent/useAgentClientExecution';
import { AgentChatMenuSheet, AgentDeleteChatDialog, AgentRenameDialog } from './AgentChatMenu';
import { AgentContextHint, AgentContextMeterButton, AgentContextSheet } from './AgentContextMeter';
import {
  AGENT_EXAMPLE_PROMPT_KEYS,
  readAgentInitialPrompt,
} from './agentExamplePrompts';

const STICK_THRESHOLD_PX = 80;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ITEM_ENTER = { duration: 0.32, ease: EASE_OUT };
const AGENT_LIST_URL = '/?tab=ai';

interface PendingSend {
  localId: string;
  text: string;
  failed: boolean;
  code: AgentErrorCode | null;
  /** Edit of a stored USER message: it and everything after it are hidden while this sends. */
  edit?: AgentEditTarget;
}

interface AgentEditTarget {
  messageId: string;
  seq: number;
}

interface AgentChatViewProps {
  chatId: string;
  /** Desktop split panel: no back button, no safe-area top, bottom tabs untouched. */
  embedded?: boolean;
}

/** Mount with `key={chatId}`: run bookkeeping below is per chat. */
export function AgentChatView({ chatId, embedded = false }: AgentChatViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setBottomTabsVisible = useShellNavStore((s) => s.setBottomTabsVisible);

  const detailQuery = useAgentChatQuery(chatId);
  const detail = detailQuery.data;
  const serverRun = detail?.activeRun ?? null;
  // Attach while the run is QUEUED or RUNNING. Every mount re-attaches: the run store keeps
  // the state across unmounts (resume after the last event id) or replays from the start.
  const serverRunId = serverRun && isLiveAgentRunStatus(serverRun.status) ? serverRun.id : null;

  // Keep the last run visible after it ends (its error / "stopped" note) until the next one.
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  useEffect(() => {
    if (serverRunId) setLastRunId(serverRunId);
  }, [serverRunId]);
  const storedRun = useAgentRun(serverRunId ?? lastRunId);
  // Stay attached to a run the server ended before this device saw its terminal event, so the
  // failure card still arrives (see `agentRunIdToAttach`).
  useAgentStream({
    chatId,
    runId: agentRunIdToAttach({ liveServerRunId: serverRunId, lastRunId, storedRun }),
  });
  // A run the server already ended without this device seeing its terminal event: its draft
  // may already be persisted, so render only the detail.
  const live =
    storedRun && (storedRun.runId === serverRunId || isTerminalPhase(storedRun.phase)) ? storedRun : null;
  const running = serverRunId != null && !(live && isTerminalPhase(live.phase));
  const queued =
    running &&
    (live?.phase === 'queued' || ((!live || live.phase === 'connecting') && serverRun?.status === 'QUEUED'));
  const queuePosition = queued ? (live?.queuePosition ?? null) : null;

  const sendMutation = useSendAgentMessageMutation(chatId);
  const cancelMutation = useCancelAgentRunMutation();
  const confirmMutation = useConfirmAgentActionMutation(chatId);
  const rejectMutation = useRejectAgentActionMutation(chatId);
  // Client-executed actions (booking plan §14.5): run in the app; re-report unsent results.
  const runClientAction = useAgentClientExecution(chatId);
  useAgentClientResume();
  const renameMutation = useRenameAgentChatMutation();
  const pinMutation = useSetAgentChatPinnedMutation();
  const archiveMutation = useSetAgentChatArchivedMutation();
  const deleteMutation = useDeleteAgentChatMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const usage = detail?.usage;
  const createChatMutation = useCreateAgentChatMutation();
  const startNewChat = useCallback(() => {
    if (createChatMutation.isPending) return;
    createChatMutation.mutate(undefined, {
      onSuccess: (chat) => {
        setContextOpen(false);
        navigate(`/ai/${encodeURIComponent(chat.id)}`, { replace: true });
      },
      onError: (err) => toast.error(extractApiErrorMessage(err, t)),
    });
  }, [createChatMutation, navigate, t]);

  useEffect(() => {
    if (embedded) return;
    setBottomTabsVisible(false);
    return () => setBottomTabsVisible(true);
  }, [embedded, setBottomTabsVisible]);

  const goBack = useCallback(() => {
    if (getBackAction().type === 'history') navigate(-1);
    else navigate(AGENT_LIST_URL, { replace: true });
    return true;
  }, [navigate]);
  useBackButtonHandler(embedded ? undefined : goBack);

  // ---- scrolling: stick to bottom unless the user scrolled up ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const stickRef = useRef(true);
  const [footerHeight, setFooterHeight] = useState(88);

  const followRafRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);

  const stopFollowing = useCallback(() => {
    if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current);
    followRafRef.current = null;
  }, []);

  // Glide to the bottom as content grows (streamed lines, cards) instead of jumping per chunk.
  // The first scroll after load is instant so the history doesn't scroll by.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!initialScrollDoneRef.current) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (followRafRef.current != null) return;
    const step = () => {
      const node = scrollRef.current;
      if (!node) {
        followRafRef.current = null;
        return;
      }
      const target = node.scrollHeight - node.clientHeight;
      const diff = target - node.scrollTop;
      if (diff <= 1) {
        node.scrollTop = target;
        followRafRef.current = null;
        return;
      }
      node.scrollTop += Math.max(1, diff * 0.22);
      followRafRef.current = requestAnimationFrame(step);
    };
    followRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => stopFollowing, [stopFollowing]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (footer) setFooterHeight(footer.offsetHeight);
      if (stickRef.current) scrollToBottom();
    });
    ro.observe(scroller);
    ro.observe(content);
    if (footer) ro.observe(footer);
    return () => ro.disconnect();
  }, [scrollToBottom, detailQuery.isSuccess]);

  const onScroll = () => {
    const el = scrollRef.current;
    // Our own glide: don't let its intermediate positions unstick the view.
    if (!el || followRafRef.current != null) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  // An edit in flight rewinds the view to before the edited message (the server does the same).
  const editCutSeq = pending.reduce<number | null>(
    (min, p) => (p.edit && (min == null || p.edit.seq < min) ? p.edit.seq : min),
    null,
  );
  const timeline = useMemo(() => {
    if (!detail) return [];
    if (editCutSeq == null) return groupAgentTimeline(buildAgentTimeline(detail.messages, detail.actions, live));
    const kept = detail.messages.filter((m) => m.seq < editCutSeq);
    return groupAgentTimeline(buildAgentTimeline(kept, detail.actions, null));
  }, [detail, live, editCutSeq]);

  // Copy / Share on a reply: on its last text block, covering every text block of that turn.
  const replyTextByKey = useMemo(() => {
    const out = new Map<string, string>();
    let texts: string[] = [];
    let lastKey: string | null = null;
    const close = () => {
      if (lastKey && texts.length) out.set(lastKey, texts.map(agentMarkdownToPlainText).join('\n\n'));
      texts = [];
      lastKey = null;
    };
    for (const item of timeline) {
      if (item.kind === 'user') close();
      else if (item.kind === 'assistantText') {
        texts.push(item.text);
        lastKey = item.key;
      }
    }
    // The turn still being written gets its actions once the run ends.
    if (!running) close();
    return out;
  }, [timeline, running]);

  // Keys on screen when the chat first loaded: that history shows at once; anything later types in.
  const initialKeysRef = useRef<Set<string> | null>(null);
  if (initialKeysRef.current == null && detail) initialKeysRef.current = new Set(timeline.map((i) => i.key));
  const arrivedLive = (key: string) => initialKeysRef.current != null && !initialKeysRef.current.has(key);

  const lastItem = timeline[timeline.length - 1];
  const contentSignature = `${timeline.length}:${lastItem?.kind === 'assistantText' ? lastItem.text.length : 0}:${pending.length}`;
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
    if (timeline.length > 0) initialScrollDoneRef.current = true;
  }, [contentSignature, scrollToBottom, timeline.length]);

  // ---- sending ----
  const send = useCallback(
    async (
      text: string,
      opts: { localId?: string; edit?: AgentEditTarget } = {},
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const localId = opts.localId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const edit = opts.edit;
      stickRef.current = true;
      setPending((prev) => [
        ...prev.filter((p) => p.localId !== localId),
        { localId, text: trimmed, failed: false, code: null, ...(edit ? { edit } : {}) },
      ]);
      try {
        await sendMutation.mutateAsync({ text: trimmed, ...(edit ? { edit } : {}) });
        setPending((prev) => prev.filter((p) => p.localId !== localId));
      } catch (err) {
        const code = agentErrorCodeOf(err);
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, failed: true, code } : p)));
      }
    },
    [sendMutation],
  );

  // Slot / booking cards send through the chat (hidden ref tokens, docs/domains/agent.md).
  const sendingNow = pending.some((p) => !p.failed);
  const cardSendApi = useMemo<AgentSendApi>(
    () => ({ send: (text) => void send(text), disabled: running || sendingNow }),
    [send, running, sendingNow],
  );

  const handleSend = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  const handleStop = () => {
    if (!serverRunId) return;
    cancelMutation.mutate(serverRunId, {
      onError: (err) => toast.error(extractApiErrorMessage(err, t)),
    });
  };

  // Example prompt handed over from the chat list: send it once the chat is loaded.
  const initialPromptSentRef = useRef(false);
  useEffect(() => {
    if (initialPromptSentRef.current || !detailQuery.isSuccess) return;
    const prompt = readAgentInitialPrompt(location.state);
    if (!prompt) return;
    initialPromptSentRef.current = true;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void send(prompt);
  }, [detailQuery.isSuccess, location.state, location.pathname, location.search, navigate, send]);

  const handleConfirm = (vars: ConfirmAgentActionVars) => {
    confirmMutation.mutate(vars, {
      onError: (err) => {
        const code = agentErrorCodeOf(err);
        toast.error(code ? t(agentErrorKey(code)) : extractApiErrorMessage(err, t));
      },
    });
  };
  const handleReject = (actionId: string) => {
    rejectMutation.mutate(actionId, {
      onError: (err) => toast.error(extractApiErrorMessage(err, t)),
    });
  };
  const handleAlwaysAllow = (actionId: string) => handleConfirm({ actionId, remember: 'always' });
  const busyFor = (actionId: string): 'confirm' | 'always' | 'reject' | null => {
    if (confirmMutation.isPending && confirmVarsActionId(confirmMutation.variables) === actionId) {
      return typeof confirmMutation.variables === 'string' ? 'confirm' : 'always';
    }
    if (rejectMutation.isPending && rejectMutation.variables === actionId) return 'reject';
    return null;
  };

  const title = detail?.title?.trim() || t('agent.newChat');

  const isArchived = Boolean(detail?.archivedAt);
  const handleTogglePin = () => {
    setMenuOpen(false);
    pinMutation.mutate(
      { chatId, pinned: !detail?.pinnedAt },
      { onError: (err) => toast.error(extractApiErrorMessage(err, t)) },
    );
  };
  // Archiving returns to the list (as before); unarchiving keeps the thread open.
  const handleToggleArchive = () => {
    setMenuOpen(false);
    const archived = !isArchived;
    archiveMutation.mutate(
      { chatId, archived },
      {
        onSuccess: () => {
          toast.success(t(archived ? 'agent.archived' : 'agent.unarchived'));
          if (archived) navigate(AGENT_LIST_URL, { replace: true });
        },
        onError: (err) => toast.error(extractApiErrorMessage(err, t)),
      },
    );
  };
  const handleDelete = () => {
    deleteMutation.mutate(
      { chatId, archived: isArchived },
      {
        onSuccess: () => {
          toast.success(t('agent.deleted'));
          navigate(AGENT_LIST_URL, { replace: true });
        },
        onError: (err) => toast.error(extractApiErrorMessage(err, t)),
      },
    );
  };

  const editBlocked = running || sendingNow;
  // Ref tokens stay hidden while editing and ride along on the resend (slot / booking cards).
  const submitEdit = (item: Extract<AgentRenderItem, { kind: 'user' }>, text: string) => {
    const tokens = parseAgentRefTokens(item.text).map((r) => agentRefToken(r.kind, r.ref));
    setEditingId(null);
    void send(tokens.length ? `${text} ${tokens.join(' ')}` : text, {
      edit: { messageId: item.messageId, seq: item.seq },
    });
  };

  const renderItem = (item: AgentRenderItem) => {
    switch (item.kind) {
      case 'user':
        if (editingId === item.messageId) {
          return (
            <AgentMessageEditor
              initialText={stripAgentRefTokens(item.text)}
              onCancel={() => setEditingId(null)}
              onSubmit={(text) => submitEdit(item, text)}
              submitDisabled={editBlocked}
            />
          );
        }
        return (
          <div className="group">
            <UserBubble text={item.text} />
            <AgentMessageActions
              align="end"
              getText={() => stripAgentRefTokens(item.text)}
              onEdit={() => setEditingId(item.messageId)}
              editDisabled={editBlocked}
            />
          </div>
        );
      case 'assistantText': {
        const replyText = replyTextByKey.get(item.key);
        return (
          <div className="group max-w-full text-gray-900 dark:text-gray-100">
            <AgentMarkdown text={item.text} streaming={item.streaming} animate={arrivedLive(item.key)} />
            {replyText ? <AgentMessageActions align="start" getText={() => replyText} /> : null}
          </div>
        );
      }
      case 'toolGroup':
        return <AgentToolGroup tools={item.tools} />;
      case 'action':
        if (item.action?.execution === 'client') {
          return (
            <AgentClientActionCard
              action={item.action}
              rejecting={busyFor(item.actionId) === 'reject'}
              onReject={handleReject}
              onRun={(actionId) => void runClientAction(actionId)}
            />
          );
        }
        return (
          <AgentActionCard
            action={item.action}
            busy={busyFor(item.actionId)}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onAlwaysAllow={handleAlwaysAllow}
          />
        );
    }
  };

  // Thinking: nothing streamed yet, waiting after a confirmation, or every tool step returned
  // and the model hasn't started its next text / call.
  const lastSegment = live?.segments[live.segments.length - 1];
  const showThinking =
    running &&
    !queued &&
    (!lastSegment ||
      lastSegment.kind === 'action' ||
      (lastSegment.kind === 'tool' && live?.tools[lastSegment.callId]?.status !== 'running'));
  // A client-side attach failure only matters while the server still has the run active.
  const runError =
    editCutSeq == null && !running && live?.phase === 'failed' && !(live.connectionFailed && serverRunId == null) ? live.error : null;
  const runStopped = editCutSeq == null && !running && live?.phase === 'cancelled';
  const isEmpty = detailQuery.isSuccess && timeline.length === 0 && pending.length === 0 && !running;

  return (
    <div
      className={`chat-container relative flex flex-col bg-gray-50 dark:bg-gray-900 ${embedded ? 'chat-embedded h-full' : 'h-screen'}`}
    >
      <header
        className="chat-thread-header z-40 flex-shrink-0 border-b border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
        style={{ paddingTop: embedded ? 0 : 'env(safe-area-inset-top)' }}
      >
        <div
          className="mx-auto flex max-w-3xl items-center gap-2 py-2.5"
          style={{
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          {!embedded ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={t('common.back')}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft size={20} className="text-gray-700 rtl:rotate-180 dark:text-gray-300" />
            </button>
          ) : null}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-white">
            <Sparkles size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white" dir="auto">
              {title}
            </h1>
            {running ? (
              <p className="text-xs text-primary-600 dark:text-primary-400">
                {queued ? t('agent.status.queued') : t('agent.status.working')}
              </p>
            ) : null}
          </div>
          <AgentContextMeterButton usage={usage} onClick={() => setContextOpen(true)} />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            disabled={!detail}
            aria-label={t('agent.menu.open')}
            className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
          >
            <MoreHorizontal size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={stopFollowing}
          onTouchStart={stopFollowing}
          className="thread-message-scroll h-full overflow-y-auto overscroll-contain"
          style={{ paddingBottom: footerHeight + 12 }}
        >
          <div ref={contentRef} className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4">
            {detailQuery.isPending ? <ThreadSkeleton /> : null}
            {detailQuery.isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                <AlertCircle size={32} className="opacity-60" aria-hidden />
                <p>{t('agent.errors.chatNotFound')}</p>
                <button
                  type="button"
                  onClick={() => navigate(AGENT_LIST_URL, { replace: true })}
                  className="rounded-xl bg-primary-600 px-4 py-2 font-medium text-white"
                >
                  {t('agent.backToChats')}
                </button>
              </div>
            ) : null}
            {isEmpty ? <EmptyThreadHint onPick={(text) => void send(text)} /> : null}

            <AnimatePresence initial={false}>
              {timeline.map((item) => (
                <motion.div
                  key={item.key}
                  layout="position"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ITEM_ENTER}
                >
                  <AgentSendContext.Provider value={cardSendApi}>{renderItem(item)}</AgentSendContext.Provider>
                </motion.div>
              ))}
              {pending.map((p) => (
                <motion.div
                  key={p.localId}
                  layout="position"
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={ITEM_ENTER}
                  style={{ transformOrigin: '100% 100%' }}
                >
                  <UserBubble text={p.text} sending={!p.failed} />
                  {p.failed ? (
                    <div className="mt-1 flex items-center justify-end gap-2 text-xs text-red-600 dark:text-red-400">
                      <span>{t(agentErrorKey(p.code))}</span>
                      <button
                        type="button"
                        onClick={() => void send(p.text, { localId: p.localId, edit: p.edit })}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2 py-0.5 font-medium dark:border-red-900/60"
                      >
                        <RotateCcw size={12} aria-hidden />
                        {t('common.retry')}
                      </button>
                      {p.edit ? (
                        <button
                          type="button"
                          onClick={() => setPending((prev) => prev.filter((x) => x.localId !== p.localId))}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2 py-0.5 font-medium dark:border-red-900/60"
                        >
                          <X size={12} aria-hidden />
                          {t('common.cancel')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="popLayout">
              {queued ? (
                <StatusFade key="queued">
                  <QueuedPlaceholder
                    label={
                      queuePosition != null && queuePosition > 0
                        ? t('agent.status.waitingInQueuePosition', { position: queuePosition })
                        : t('agent.status.waitingInQueue')
                    }
                  />
                </StatusFade>
              ) : null}
              {showThinking ? (
                <StatusFade key="thinking">
                  <ThinkingDots label={t('agent.status.thinking')} />
                </StatusFade>
              ) : null}
              {runError ? (
                <StatusFade key="error">
                  <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
                    <span>{t(agentErrorKey(runError.code))}</span>
                  </div>
                </StatusFade>
              ) : null}
              {runStopped ? (
                <StatusFade key="stopped">
                  <p className="text-center text-xs text-gray-400 dark:text-gray-500">{t('agent.status.stopped')}</p>
                </StatusFade>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer
        ref={footerRef}
        data-cap-chat-composer
        className="absolute bottom-0 left-0 right-0 z-50 flex-shrink-0 border-transparent !bg-transparent"
      >
        <AgentContextHint usage={usage} onNewChat={startNewChat} creating={createChatMutation.isPending} />
        <AgentComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onStop={handleStop}
          running={running}
          stopping={cancelMutation.isPending}
          disabled={!detail}
        />
      </footer>

      <AgentChatMenuSheet
        open={menuOpen}
        title={title}
        onClose={() => setMenuOpen(false)}
        onRename={() => {
          setMenuOpen(false);
          setRenameOpen(true);
        }}
        pinned={Boolean(detail?.pinnedAt)}
        archived={isArchived}
        onTogglePin={handleTogglePin}
        onToggleArchive={handleToggleArchive}
        onDelete={() => {
          setMenuOpen(false);
          setDeleteOpen(true);
        }}
      />
      <AgentDeleteChatDialog
        open={deleteOpen}
        title={title}
        deleting={deleteMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
      <AgentContextSheet
        open={contextOpen}
        usage={usage}
        onClose={() => setContextOpen(false)}
        onNewChat={startNewChat}
        creating={createChatMutation.isPending}
      />
      <AgentRenameDialog
        open={renameOpen}
        initialTitle={detail?.title ?? ''}
        saving={renameMutation.isPending}
        onClose={() => setRenameOpen(false)}
        onSave={(value) =>
          renameMutation.mutate({ chatId, title: value }, {
            onSuccess: () => setRenameOpen(false),
            onError: (err) => toast.error(extractApiErrorMessage(err, t)),
          })
        }
      />
    </div>
  );
}

function UserBubble({ text, sending = false }: { text: string; sending?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        dir="auto"
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-blue-600 px-3.5 py-2 text-[15px] leading-relaxed text-white transition-opacity ${
          sending ? 'opacity-70' : ''
        }`}
      >
        {stripAgentRefTokens(text)}
      </div>
    </div>
  );
}

function StatusFade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={ITEM_ENTER}
      className="flex flex-col"
    >
      {children}
    </motion.div>
  );
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
            animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

function QueuedPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 self-start rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      role="status"
    >
      <Hourglass size={14} className="flex-shrink-0 animate-pulse text-primary-600 dark:text-primary-400" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="ms-auto h-9 w-2/5 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-2">
        <div className="h-3 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="ms-auto h-9 w-1/3 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

function EmptyThreadHint({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg">
        <Sparkles size={26} aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-white">{t('agent.empty.chatTitle')}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('agent.empty.chatHint')}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        {AGENT_EXAMPLE_PROMPT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(t(key))}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-start text-sm text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            dir="auto"
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
