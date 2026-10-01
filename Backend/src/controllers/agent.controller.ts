/**
 * AI agent REST + SSE (`/api/agent`, contract: `Frontend/shared/agentContract.ts`).
 * Every lookup is scoped by `req.userId`; foreign ids are 404.
 */
import type { AgentChatDto, AgentClientReportRequest } from '@bandeja/shared/agentContract';
import prisma from '../config/database';
import type { AuthRequest } from '../middleware/auth';
import { getValidatedRequestPart } from '../middleware/validateZod';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  archiveAgentChat,
  createAgentChat,
  getAgentChatDetail,
  listAgentChats,
  renameAgentChat,
} from '../services/agent/agentChat.service';
import {
  AGENT_SSE_KEEPALIVE_FRAME,
  formatAgentSseFrame,
  parseAgentReplayCursor,
} from '../services/agent/agentEvents';
import { expireStaleAgentActions } from '../services/agent/agentActionOutcome';
import { confirmAgentAction, rejectAgentAction } from '../services/agent/agentActions.service';
import {
  addAgentMemoryFromText,
  clearAgentMemories,
  deleteAgentMemory,
  getAgentMemoryOverview,
  setAgentMemoryEnabled,
  toAgentMemoryDto,
  updateAgentMemoryText,
} from '../services/agent/agentMemory.service';
import { getAgentToolPermissionService } from '../services/agent/agentToolPermission.service';
import { loadAgentPrincipal } from '../services/agent/access/agentPrincipal';
import { getAgentRunService } from '../services/agent/agentRun.service';
import { AgentRunFeed } from '../services/agent/agentRunFeed';
import { sendAgentUserMessage } from '../services/agent/agentSendMessage.service';
import { AGENT_CLIENT_CAPS_HEADER, parseAgentClientCaps } from '../services/agent/clientExecution/clientCaps';
import { getAgentClientExecutionService } from '../services/agent/clientExecution/clientExecution.service';

export const AGENT_SSE_KEEPALIVE_MS = 15_000;

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new ApiError(401, 'No token provided', true, { code: 'auth.noToken' });
  return req.userId;
}

export const listChats = asyncHandler<AuthRequest>(async (req, res) => {
  const userId = requireUserId(req);
  // Lazy expiry, so `activeRun` never points at a run waiting on a dead confirmation.
  await expireStaleAgentActions({ userId }, new Date());
  const chats = await listAgentChats(userId);
  res.json({ success: true, data: { chats } });
});

export const createChat = asyncHandler<AuthRequest>(async (req, res) => {
  const chat: AgentChatDto = await createAgentChat(requireUserId(req));
  res.status(201).json({ success: true, data: chat });
});

export const getChat = asyncHandler<AuthRequest>(async (req, res) => {
  const userId = requireUserId(req);
  await expireStaleAgentActions({ userId, chatId: req.params.chatId }, new Date());
  const data = await getAgentChatDetail(userId, req.params.chatId);
  res.json({ success: true, data });
});

export const patchChat = asyncHandler<AuthRequest>(async (req, res) => {
  const data = await renameAgentChat(requireUserId(req), req.params.chatId, String(req.body.title ?? ''));
  res.json({ success: true, data });
});

export const deleteChat = asyncHandler<AuthRequest>(async (req, res) => {
  const userId = requireUserId(req);
  await getAgentRunService().cancelChatRuns(userId, req.params.chatId);
  await archiveAgentChat(userId, req.params.chatId);
  res.json({ success: true, data: { ok: true } });
});

export const postMessage = asyncHandler<AuthRequest>(async (req, res) => {
  const data = await sendAgentUserMessage({
    user: { id: requireUserId(req), isAdmin: Boolean(req.user?.isAdmin) },
    chatId: req.params.chatId,
    text: String(req.body.text ?? ''),
    locale: req.get('X-App-Locale') ?? null,
    clientCaps: parseAgentClientCaps(req.get(AGENT_CLIENT_CAPS_HEADER)),
    quota: 'counted', // `agentMessageLimiter` on the route counted it in the shared store
  });
  res.status(201).json({ success: true, data });
});

export const cancelRun = asyncHandler<AuthRequest>(async (req, res) => {
  await getAgentRunService().cancelRun(requireUserId(req), req.params.runId);
  res.json({ success: true, data: { ok: true } });
});

/**
 * Confirm a pending write: owner only (foreign ids 404), PENDING and not expired, runs at
 * most once (double taps get the current state), re-authorizes against the DB principal,
 * executes, then enqueues a QUEUED follow-up run. `{ action, runId }` (runId may be null).
 */
export const confirmAction = asyncHandler<AuthRequest>(async (req, res) => {
  const body = getValidatedRequestPart<{ remember?: 'always' } | undefined>(req, 'body');
  const data = await confirmAgentAction({ userId: requireUserId(req) }, req.params.actionId, {
    locale: req.get('X-App-Locale') ?? null,
    remember: body?.remember ?? null,
  });
  res.json({ success: true, data: { ...data, remembered: data.remembered ?? false } });
});

/** Tool permissions (plan §15): principal re-loaded so admin-scope tools follow the DB flag. */
async function permissionPrincipal(req: AuthRequest) {
  return loadAgentPrincipal(requireUserId(req));
}

function permissionLocale(req: AuthRequest, principal: { language: string | null }): string | null {
  return req.get('X-App-Locale') ?? principal.language ?? null;
}

/** `GET /agent/permissions` → `{ tools: AgentToolPermissionDto[] }` (write tools this user has). */
export const listToolPermissions = asyncHandler<AuthRequest>(async (req, res) => {
  const principal = await permissionPrincipal(req);
  const tools = await getAgentToolPermissionService().list(principal, permissionLocale(req, principal));
  res.json({ success: true, data: { tools } });
});

/** `PUT /agent/permissions/:toolName {mode}`; ALWAYS_ALLOW on a critical tool → 400 PERMISSION_NOT_ALLOWED. */
export const setToolPermission = asyncHandler<AuthRequest>(async (req, res) => {
  const principal = await permissionPrincipal(req);
  const { mode } = getValidatedRequestPart<{ mode: 'ASK' | 'ALWAYS_ALLOW' }>(req, 'body');
  const data = await getAgentToolPermissionService().set(
    principal,
    req.params.toolName,
    mode,
    permissionLocale(req, principal),
  );
  res.json({ success: true, data });
});

/** `DELETE /agent/permissions/:toolName` → back to ASK. */
export const resetToolPermission = asyncHandler<AuthRequest>(async (req, res) => {
  const principal = await permissionPrincipal(req);
  const [data] = await getAgentToolPermissionService().reset(
    principal,
    req.params.toolName,
    permissionLocale(req, principal),
  );
  res.json({ success: true, data });
});

/** `DELETE /agent/permissions` → every tool back to ASK; `{ tools }`. */
export const resetToolPermissions = asyncHandler<AuthRequest>(async (req, res) => {
  const principal = await permissionPrincipal(req);
  const tools = await getAgentToolPermissionService().reset(principal, undefined, permissionLocale(req, principal));
  res.json({ success: true, data: { tools } });
});

/** `GET /agent/memory` → `AgentMemoryOverviewDto` (own rows; also while OFF). */
export const getMemory = asyncHandler<AuthRequest>(async (req, res) => {
  res.json({ success: true, data: await getAgentMemoryOverview(requireUserId(req)) });
});

/** `PUT /agent/memory/settings {enabled}` → `AgentMemoryOverviewDto`. Rows are kept either way. */
export const setMemorySettings = asyncHandler<AuthRequest>(async (req, res) => {
  const { enabled } = getValidatedRequestPart<{ enabled: boolean }>(req, 'body');
  res.json({ success: true, data: await setAgentMemoryEnabled(requireUserId(req), enabled) });
});

/** `POST /agent/memory/items {text}` → `AgentMemoryDto` (USER_ASKED; 409 while OFF or full). */
export const addMemoryItem = asyncHandler<AuthRequest>(async (req, res) => {
  const { text } = getValidatedRequestPart<{ text: string }>(req, 'body');
  const row = await addAgentMemoryFromText(requireUserId(req), text);
  res.status(201).json({ success: true, data: toAgentMemoryDto(row) });
});

/** `PATCH /agent/memory/items/:id {text}` → `AgentMemoryDto` (foreign id 404; 409 while OFF). */
export const updateMemoryItem = asyncHandler<AuthRequest>(async (req, res) => {
  const { text } = getValidatedRequestPart<{ text: string }>(req, 'body');
  const row = await updateAgentMemoryText(requireUserId(req), req.params.id, text);
  res.json({ success: true, data: toAgentMemoryDto(row) });
});

/** `DELETE /agent/memory/items/:id` (foreign id 404; allowed while OFF). */
export const deleteMemoryItem = asyncHandler<AuthRequest>(async (req, res) => {
  await deleteAgentMemory(requireUserId(req), req.params.id);
  res.json({ success: true, data: { ok: true } });
});

/** `DELETE /agent/memory/items` → `{ ok, deleted }` (allowed while OFF). */
export const clearMemoryItems = asyncHandler<AuthRequest>(async (req, res) => {
  const deleted = await clearAgentMemories(requireUserId(req));
  res.json({ success: true, data: { ok: true, deleted } });
});

/**
 * Client-executed actions (booking plan §14.5): claim a lease for the app to run the
 * provider write, then report what happened. Owner only (foreign ids 404).
 */
export const claimAction = asyncHandler<AuthRequest>(async (req, res) => {
  const body = getValidatedRequestPart<{ clientKey: string }>(req, 'body');
  const data = await getAgentClientExecutionService().claim(
    requireUserId(req),
    req.params.actionId,
    body.clientKey,
    req.get('X-App-Locale') ?? null,
  );
  res.json({ success: true, data });
});

export const reportAction = asyncHandler<AuthRequest>(async (req, res) => {
  const body = getValidatedRequestPart<AgentClientReportRequest>(req, 'body');
  const data = await getAgentClientExecutionService().report(
    requireUserId(req),
    req.params.actionId,
    body,
    req.get('X-App-Locale') ?? null,
  );
  res.json({ success: true, data });
});

/** Reject a pending write: REJECTED, "declined" in history, no follow-up run. */
export const rejectAction = asyncHandler<AuthRequest>(async (req, res) => {
  const data = await rejectAgentAction({ userId: requireUserId(req) }, req.params.actionId, {
    locale: req.get('X-App-Locale') ?? null,
  });
  res.json({ success: true, data });
});

/**
 * `GET /agent/runs/:runId/events` (SSE). Replays events after `?after=` / `Last-Event-ID`
 * (none = from the start, `text.delta`s included), then streams live ones; closes after the
 * terminal event. Runs never depend on a listener. When the log is gone, a finished run is
 * replayed from the database; an unfinished one gets a fresh (resumed) log.
 */
export const streamRunEvents = asyncHandler<AuthRequest>(async (req, res) => {
  const userId = requireUserId(req);
  const run = await prisma.agentRun.findFirst({ where: { id: req.params.runId, userId } });
  if (!run) throw new ApiError(404, 'Run not found');

  const after = parseAgentReplayCursor(req.query.after, req.headers['last-event-id']);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  const feed = new AgentRunFeed({
    source: getAgentRunService(),
    run,
    after,
    onEvent: (stored) => res.write(formatAgentSseFrame(stored)),
    onEnd: () => res.end(),
    keepaliveMs: AGENT_SSE_KEEPALIVE_MS,
    onKeepalive: () => res.write(AGENT_SSE_KEEPALIVE_FRAME),
    reloadRun: (runId) => prisma.agentRun.findUnique({ where: { id: runId } }),
  });
  req.on('close', () => feed.close());
  await feed.start();
});
