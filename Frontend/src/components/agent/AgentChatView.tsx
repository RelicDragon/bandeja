import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ChevronUp, Hourglass, MoreHorizontal, RotateCcw, X } from 'lucide-react';
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
  useSetAgentMessageFeedbackMutation,
} from '@/queries/agent/useAgentQueries';
import { useAgentStream } from '@/features/agent/useAgentStream';
import { agentRunIdToAttach } from '@/features/agent/agentRunAttach';
import { useAgentRun } from '@/features/agent/agentRunStore';
import { isTerminalPhase } from '@/features/agent/agentRunReducer';
import { isLiveAgentRunStatus } from '@/features/agent/agentChatsPolling';
import { buildAgentTimeline, groupAgentTimeline, type AgentRenderItem } from '@/features/agent/agentTimeline';
import {
  agentErrorCodeOf,
  agentErrorKey,
  agentErrorRetryAt,
  agentRunFailureRetryAt,
  isAgentLimitCode,
} from '@/features/agent/agentErrors';
import { useAgentLimitClock, useAgentResetTime, type AgentLimit } from '@/features/agent/agentLimits';
import { lastAgentReplyKey, lastAgentUserItem } from '@/features/agent/agentRenderItemEqual';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { AgentSendContext, type AgentSendApi } from '@/features/agent/agentSendContext';
import { agentRefToken, parseAgentRefTokens, stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { agentMarkdownToPlainText } from '@/features/agent/agentMessageShare';
import {
  AgentImagesContext,
  agentImageMediaItem,
  collectAgentChatImages,
  type AgentImagesContextValue,
} from '@/features/agent/agentImages';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import type { AgentErrorCode, AgentMessageFeedback, AgentWebImage } from '@shared/agentContract';
import { AgentGlyph } from './AgentGlyph';
import { AgentComposer } from './AgentComposer';
import { AgentVoiceDock } from './AgentVoiceDock';
import { useAgentVoiceConversation } from '@/features/agent/voice/useAgentVoiceConversation';
import type { AgentVoiceCloseReason, AgentVoiceNotice } from '@/features/agent/voice/agentVoiceSession';
import { AgentTimelineItem, UserBubble, type AgentTimelineHandlers } from './AgentTimelineItem';
import { AgentJumpToBottom } from './AgentJumpToBottom';
import { AgentLimitCard, AgentRunErrorBanner } from './AgentLimitCard';
import { useAgentClientExecution, useAgentClientResume } from '@/queries/agent/useAgentClientExecution';
import { AgentChatMenuSheet, AgentDeleteChatDialog, AgentRenameDialog } from './AgentChatMenu';
import { AgentContextHint, AgentContextMeterButton, AgentContextSheet } from './AgentContextMeter';
import {
  readAgentInitialPrompt,
} from './agentExamplePrompts';
import { AgentFollowUpChips } from './AgentFollowUpChips';
import { AgentSuggestedPrompts } from './AgentSuggestedPrompts';

const STICK_THRESHOLD_PX = 80;
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ITEM_ENTER = { duration: 0.32, ease: EASE_OUT };
const AGENT_LIST_URL = '/?tab=ai';
/** Only the newest rows animate layout; settled history is not measured on every update. */
const LAYOUT_TAIL = 4;
/** Long chats: past this many rows only the newest `WINDOW_SIZE` render, "Show earlier" adds more. */
const WINDOW_THRESHOLD = 80;
const WINDOW_SIZE = 60;
const WINDOW_STEP = 40;
const REPLY_FINISHED_CLEAR_MS = 4000;

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
  // Mirrors `stickRef` for rendering: the jump-to-bottom button shows while scrolled away.
  const [atBottom, setAtBottom] = useState(true);
  // New content arrived below while scrolled away: a dot on the jump button.
  const [unseenBelow, setUnseenBelow] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

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

  const stickToBottom = useCallback(() => {
    stickRef.current = true;
    setAtBottom(true);
    setUnseenBelow(false);
  }, []);

  const jumpToBottom = useCallback(() => {
    stickToBottom();
    const el = scrollRef.current;
    if (reducedMotion && el) {
      stopFollowing();
      el.scrollTop = el.scrollHeight;
      return;
    }
    scrollToBottom();
  }, [reducedMotion, scrollToBottom, stickToBottom, stopFollowing]);

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
    const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    stickRef.current = stuck;
    setAtBottom(stuck);
    if (stuck) setUnseenBelow(false);
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

  // Pictures (`web_images`): inline in replies, fullscreen with swipe through the chat's pictures.
  const chatImages = useMemo(() => collectAgentChatImages(timeline), [timeline]);
  // `initialId` only seeds the viewer; swiping is the viewer's own state.
  const [imageViewer, setImageViewer] = useState<{ scope: readonly AgentWebImage[]; initialId: string } | null>(null);
  const imagesApi = useMemo<AgentImagesContextValue>(
    () => ({
      byId: chatImages.byId,
      open: (id, scope) => {
        const list = scope?.length ? scope : chatImages.gallery;
        const image = chatImages.byId.get(id);
        if (!image) return;
        setImageViewer({ scope: list.some((i) => i.id === id) ? list : [image], initialId: id });
      },
    }),
    [chatImages],
  );
  const viewerItems = useMemo(() => (imageViewer ? imageViewer.scope.map(agentImageMediaItem) : []), [imageViewer]);
  const viewerActiveItem = imageViewer ? viewerItems.find((item) => item.id === `agent-image:${imageViewer.initialId}`) : undefined;

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
  const lastReplyKey = useMemo(() => lastAgentReplyKey(timeline, replyTextByKey), [timeline, replyTextByKey]);
  const lastUserItem = useMemo(() => lastAgentUserItem(timeline), [timeline]);
  const feedbackByMessageId = useMemo(() => {
    const out = new Map<string, AgentMessageFeedback>();
    for (const m of detail?.messages ?? []) if (m.feedback) out.set(m.id, m.feedback);
    return out;
  }, [detail?.messages]);

  // Keys on screen when the chat first loaded: that history shows at once; anything later types in.
  const initialKeysRef = useRef<Set<string> | null>(null);
  if (initialKeysRef.current == null && detail) initialKeysRef.current = new Set(timeline.map((i) => i.key));
  const arrivedLive = (key: string) => initialKeysRef.current != null && !initialKeysRef.current.has(key);

  // Long chats: only the newest rows render; "Show earlier messages" reveals more, keeping the
  // view where it was. Set once when the chat loads; new rows append without hiding older ones.
  const [hiddenBefore, setHiddenBefore] = useState<number | null>(null);
  if (hiddenBefore == null && detail) {
    setHiddenBefore(timeline.length > WINDOW_THRESHOLD ? timeline.length - WINDOW_SIZE : 0);
  }
  const hiddenCount = Math.max(0, Math.min(hiddenBefore ?? 0, timeline.length - WINDOW_SIZE));
  const visibleTimeline = useMemo(() => (hiddenCount > 0 ? timeline.slice(hiddenCount) : timeline), [timeline, hiddenCount]);
  const revealAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const showEarlier = () => {
    const el = scrollRef.current;
    if (el) revealAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    setHiddenBefore(Math.max(0, hiddenCount - WINDOW_STEP));
  };
  useLayoutEffect(() => {
    const anchor = revealAnchorRef.current;
    const el = scrollRef.current;
    if (!anchor || !el) return;
    revealAnchorRef.current = null;
    el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
  }, [hiddenCount]);

  const lastItem = timeline[timeline.length - 1];
  const contentSignature = `${timeline.length}:${lastItem?.kind === 'assistantText' ? lastItem.text.length : 0}:${pending.length}`;
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
    else if (initialScrollDoneRef.current) setUnseenBelow(true);
    if (timeline.length > 0) initialScrollDoneRef.current = true;
  }, [contentSignature, scrollToBottom, timeline.length]);

  // ---- limits: a refused send (429) or a `run.failed` on the rate limit / daily budget ----
  const [sendLimit, setSendLimit] = useState<AgentLimit | null>(null);
  const dailyResetsAtRef = useRef<string | undefined>(undefined);
  dailyResetsAtRef.current = usage?.dailyResetsAt;

  // ---- sending ----
  const send = useCallback(
    async (
      text: string,
      opts: { localId?: string; edit?: AgentEditTarget; voice?: boolean } = {},
    ): Promise<string | null> => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const localId = opts.localId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const edit = opts.edit;
      stickToBottom();
      setPending((prev) => [
        ...prev.filter((p) => p.localId !== localId),
        { localId, text: trimmed, failed: false, code: null, ...(edit ? { edit } : {}) },
      ]);
      try {
        const { runId } = await sendMutation.mutateAsync({
          text: trimmed,
          ...(edit ? { edit } : {}),
          ...(opts.voice ? { voice: true } : {}),
        });
        setPending((prev) => prev.filter((p) => p.localId !== localId));
        setSendLimit(null);
        return runId;
      } catch (err) {
        const code = agentErrorCodeOf(err);
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, failed: true, code } : p)));
        if (isAgentLimitCode(code)) {
          setSendLimit({ code, retryAt: agentErrorRetryAt(err, { dailyResetsAt: dailyResetsAtRef.current }) });
        }
        if (opts.voice) throw err;
        return null;
      }
    },
    [sendMutation, stickToBottom],
  );

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

  const runLimit = useMemo<AgentLimit | null>(
    () =>
      runError && isAgentLimitCode(runError.code)
        ? { code: runError.code, retryAt: agentRunFailureRetryAt(runError.code, runError.retryAt, usage?.dailyResetsAt) }
        : null,
    [runError, usage?.dailyResetsAt],
  );
  const limit = sendLimit ?? runLimit;
  const limitClock = useAgentLimitClock(limit?.retryAt ?? null);
  // Paused until `retryAt`; a limit with no known time only explains itself.
  const sendPaused = limit != null && limitClock.active;
  const showLimitCard = limit != null && (limitClock.active || limit.retryAt == null);
  const limitResetTime = useAgentResetTime(sendPaused ? (limit?.retryAt ?? null) : null);
  const composerPausedReason = sendPaused
    ? limitResetTime
      ? t('agent.limits.composerPaused', { time: limitResetTime })
      : t('agent.limits.composerPausedNoTime')
    : null;

  // ---- voice conversation (docs/domains/agent.md § Voice): the dock replaces the composer ----
  const hasPendingAction = Boolean(detail?.actions.some((a) => a.status === 'PENDING'));
  const handleVoiceClose = useCallback(
    (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => {
      if (notice) toast(t(`agent.voice.notice.${notice}`));
      else if (reason === 'idle') toast(t('agent.voice.notice.idle'));
    },
    [t],
  );
  const voice = useAgentVoiceConversation({
    serverRunId,
    running,
    pendingAction: hasPendingAction,
    send: async (text) => {
      const runId = await send(text, { voice: true });
      if (!runId) throw new Error('voice send failed');
      return runId;
    },
    cancelRun: async (runId) => {
      await cancelMutation.mutateAsync(runId);
    },
    onClose: handleVoiceClose,
    confirmPrompt: (title) => t('agent.voice.confirmPrompt', { title: title ?? t('agent.voice.confirmFallbackTitle') }),
  });
  const voiceActive = voice.active;

  // Slot / booking cards send through the chat (hidden ref tokens, docs/domains/agent.md).
  const sendingNow = pending.some((p) => !p.failed);
  const cardSendApi = useMemo<AgentSendApi>(
    () => ({
      send: (text) => void send(text, { voice: voiceActive }).catch(() => {}),
      disabled: running || sendingNow || sendPaused,
    }),
    [send, running, sendingNow, sendPaused, voiceActive],
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
  const busyFor = (actionId: string): 'confirm' | 'always' | 'reject' | null => {
    if (confirmMutation.isPending && confirmVarsActionId(confirmMutation.variables) === actionId) {
      return typeof confirmMutation.variables === 'string' ? 'confirm' : 'always';
    }
    if (rejectMutation.isPending && rejectMutation.variables === actionId) return 'reject';
    return null;
  };

  const feedbackMutation = useSetAgentMessageFeedbackMutation(chatId);
  const handleFeedback = (messageId: string, rating: AgentMessageFeedback | null, comment?: string) => {
    feedbackMutation.mutate(
      { messageId, rating, ...(comment ? { comment } : {}) },
      {
        onSuccess: () => {
          if (comment) toast.success(t('agent.message.feedbackThanks'));
        },
        onError: () => toast.error(t('agent.message.feedbackFailed')),
      },
    );
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

  const editBlocked = running || sendingNow || sendPaused;
  // Ref tokens stay hidden while editing and ride along on the resend (slot / booking cards).
  const submitEdit = (item: Extract<AgentRenderItem, { kind: 'user' }>, text: string) => {
    const tokens = parseAgentRefTokens(item.text).map((r) => agentRefToken(r.kind, r.ref));
    setEditingId(null);
    void send(tokens.length ? `${text} ${tokens.join(' ')}` : text, {
      edit: { messageId: item.messageId, seq: item.seq },
    });
  };
  // Retry a failed run / Regenerate the last reply: resend the newest own message unchanged,
  // through the edit path (the server rewinds to it and runs again).
  const resendLastUser = () => {
    if (!lastUserItem || editBlocked) return;
    submitEdit(lastUserItem, stripAgentRefTokens(lastUserItem.text));
  };

  // Focus: back to the Edit button after cancelling an edit.
  const focusEditKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = focusEditKeyRef.current;
    if (!key || editingId) return;
    focusEditKeyRef.current = null;
    requestAnimationFrame(() =>
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-agent-item="${cssEscape(key)}"] [data-agent-edit]`)
        ?.focus({ preventScroll: true }),
    );
  }, [editingId]);

  // One stable handlers object: rows re-render only when their own data changes. The ref holds
  // this render's closures; the memoized wrappers always call the latest ones.
  const handlersImplRef = useRef<Omit<AgentTimelineHandlers, 'alwaysAllow'> | null>(null);
  handlersImplRef.current = {
    startEdit: (messageId) => setEditingId(messageId),
    cancelEdit: (key) => {
      focusEditKeyRef.current = key;
      setEditingId(null);
    },
    submitEdit,
    regenerate: resendLastUser,
    feedback: handleFeedback,
    confirm: handleConfirm,
    reject: handleReject,
    runClientAction: (actionId) => void runClientAction(actionId),
  };
  const handlers = useMemo<AgentTimelineHandlers>(
    () => ({
      startEdit: (messageId) => handlersImplRef.current?.startEdit(messageId),
      cancelEdit: (key) => handlersImplRef.current?.cancelEdit(key),
      submitEdit: (item, text) => handlersImplRef.current?.submitEdit(item, text),
      regenerate: () => handlersImplRef.current?.regenerate(),
      feedback: (messageId, rating, comment) => handlersImplRef.current?.feedback(messageId, rating, comment),
      confirm: (vars) => handlersImplRef.current?.confirm(vars),
      reject: (actionId) => handlersImplRef.current?.reject(actionId),
      alwaysAllow: (actionId) => handlersImplRef.current?.confirm({ actionId, remember: 'always' }),
      runClientAction: (actionId) => handlersImplRef.current?.runClientAction(actionId),
    }),
    [],
  );

  // Focus: a confirmation card that arrives while the chat is open gets its primary button,
  // unless the user is typing.
  const focusedActionKeysRef = useRef(new Set<string>());
  useEffect(() => {
    const fresh = timeline.find(
      (item) =>
        item.kind === 'action' &&
        item.action?.status === 'PENDING' &&
        initialKeysRef.current != null &&
        !initialKeysRef.current.has(item.key) &&
        !focusedActionKeysRef.current.has(item.key),
    );
    if (!fresh) return;
    focusedActionKeysRef.current.add(fresh.key);
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && active.value.trim() !== '') return;
    const raf = requestAnimationFrame(() =>
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-agent-item="${cssEscape(fresh.key)}"] [data-agent-primary]`)
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(raf);
  }, [timeline]);

  // Screen readers: streamed text is `aria-busy` (not read per character); one short
  // "Reply finished" status when a run ends with an answer.
  const [replyAnnouncement, setReplyAnnouncement] = useState('');
  const wasRunningRef = useRef(running);
  const livePhase = live?.phase;
  useEffect(() => {
    const ended = wasRunningRef.current && !running;
    wasRunningRef.current = running;
    if (!ended || (livePhase !== 'completed' && livePhase !== 'awaiting_confirmation')) return;
    setReplyAnnouncement(t('agent.thread.replyFinished'));
    const timer = window.setTimeout(() => setReplyAnnouncement(''), REPLY_FINISHED_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [running, livePhase, t]);

  const showJump = !atBottom && timeline.length > 0;

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
          <div className={`min-w-0 flex-1 ${embedded ? 'ps-1' : ''}`}>
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white" dir="auto">
              {title}
            </h1>
            {running ? (
              <p className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400">
                <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
                  {queued ? null : (
                    <span className="absolute inset-0 rounded-full bg-primary-400 opacity-75 motion-safe:animate-ping" />
                  )}
                  <span
                    className={`relative h-2 w-2 rounded-full ${queued ? 'bg-primary-300 motion-safe:animate-pulse dark:bg-primary-700' : 'bg-primary-500'}`}
                  />
                </span>
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
          <div
            ref={contentRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={title}
            className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4"
          >
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

            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={showEarlier}
                className="mx-auto inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <ChevronUp size={14} aria-hidden />
                {t('agent.thread.showEarlier')}
              </button>
            ) : null}

            <AgentSendContext.Provider value={cardSendApi}>
              <AgentImagesContext.Provider value={imagesApi}>
                <AnimatePresence initial={false}>
                  {visibleTimeline.map((item, i) => {
                    const arrived = arrivedLive(item.key);
                    const layoutOn = i >= visibleTimeline.length - LAYOUT_TAIL;
                    const messageId =
                      item.kind === 'assistantText' ? item.messageId : undefined;
                    return (
                      <motion.div
                        key={item.key}
                        data-agent-item={item.key}
                        layout={layoutOn ? 'position' : false}
                        initial={arrived ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={ITEM_ENTER}
                      >
                        <AgentTimelineItem
                          item={item}
                          handlers={handlers}
                          editing={item.kind === 'user' && editingId === item.messageId}
                          editBlocked={editBlocked}
                          replyText={replyTextByKey.get(item.key)}
                          animate={arrived}
                          canRegenerate={item.key === lastReplyKey && !running && lastUserItem != null}
                          feedback={messageId ? (feedbackByMessageId.get(messageId) ?? null) : null}
                          busy={item.kind === 'action' ? busyFor(item.actionId) : null}
                        />
                      </motion.div>
                    );
                  })}
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
                          {sendPaused ? null : (
                            <button
                              type="button"
                              onClick={() => void send(p.text, { localId: p.localId, edit: p.edit })}
                              className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2 py-0.5 font-medium dark:border-red-900/60"
                            >
                              <RotateCcw size={12} aria-hidden />
                              {t('common.retry')}
                            </button>
                          )}
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
              </AgentImagesContext.Provider>
            </AgentSendContext.Provider>

            {detail ? (
              <AgentFollowUpChips
                messages={detail.messages}
                actions={detail.actions}
                hidden={
                  running ||
                  pending.length > 0 ||
                  draft.trim() !== '' ||
                  editCutSeq != null ||
                  editingId != null ||
                  runError != null ||
                  sendPaused
                }
                onPick={(text) => void send(text)}
              />
            ) : null}

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
              {showLimitCard && limit ? (
                <StatusFade key="limit">
                  <AgentLimitCard limit={limit} msLeft={limitClock.msLeft} />
                </StatusFade>
              ) : null}
              {runError && !(showLimitCard && runLimit) ? (
                <StatusFade key="error">
                  <AgentRunErrorBanner
                    code={runError.code}
                    onRetry={lastUserItem ? resendLastUser : undefined}
                    retryDisabled={editBlocked}
                  />
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
        <div className="sr-only" role="status" aria-live="polite">
          {replyAnnouncement}
        </div>
      </main>

      <footer
        ref={footerRef}
        data-cap-chat-composer
        className="absolute bottom-0 left-0 right-0 z-50 flex-shrink-0 border-transparent !bg-transparent"
      >
        <AgentJumpToBottom visible={showJump} unread={unseenBelow || (showJump && running)} onJump={jumpToBottom} />
        <AgentContextHint usage={usage} onNewChat={startNewChat} creating={createChatMutation.isPending} />
        <AnimatePresence mode="wait" initial={false}>
          {voiceActive ? (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
              transition={ITEM_ENTER}
            >
              <AgentVoiceDock state={voice.state} session={voice.session} onEnd={() => voice.session.stop('user')} />
            </motion.div>
          ) : (
            <motion.div
              key="composer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={ITEM_ENTER}
            >
              <AgentComposer
                value={draft}
                onChange={setDraft}
                onSend={handleSend}
                onStop={handleStop}
                onStartVoice={() => void voice.session.start()}
                running={running}
                stopping={cancelMutation.isPending}
                disabled={!detail}
                pausedReason={composerPausedReason}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
      {imageViewer && viewerActiveItem ? (
        <FullscreenImageViewer
          isOpen
          imageUrl={viewerActiveItem.originalUrl}
          mediaItems={viewerItems}
          initialMediaId={viewerActiveItem.id}
          onClose={() => setImageViewer(null)}
          modalId="agent-image-viewer"
        />
      ) : null}
    </div>
  );
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-violet-600 text-white shadow-lg shadow-violet-500/25 dark:shadow-violet-900/40">
        <AgentGlyph size={28} />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-white">{t('agent.empty.chatTitle')}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('agent.empty.chatHint')}</p>
      </div>
      <AgentSuggestedPrompts onPick={onPick} />
    </div>
  );
}
