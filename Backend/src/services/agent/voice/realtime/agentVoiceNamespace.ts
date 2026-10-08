/**
 * Socket.IO namespace `/agent-voice` (wire contract `Frontend/shared/agentVoiceRealtime.ts`,
 * docs/domains/agent.md § Voice): agent voice v2 sessions.
 *
 * - Handshake: the same JWT as the main namespace (`auth.token` or `Authorization: Bearer`),
 *   active users only.
 * - `voice:start` → checks (v2 available, per-user start limit shared via Redis, chat ownership,
 *   daily budget) then one `AgentVoiceRealtimeSession` per socket. One session per user: a start elsewhere
 *   (this process, or another one via Redis pub/sub) ends the old one with `reason: 'replaced'`.
 * - Optional handshake extension `auth.clientCaps` (same format as `X-Agent-Client-Caps`); without
 *   it the chat's latest run's caps are reused.
 * - Nothing of the audio is stored; usage rows hold durations and character counts only.
 */
import { randomUUID } from 'node:crypto';
import type { Options } from 'express-rate-limit';
import type { Namespace, Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';
import {
  AGENT_VOICE_INPUT_SAMPLE_RATE,
  AGENT_VOICE_NAMESPACE,
  AGENT_VOICE_OUTPUT_SAMPLE_RATE,
  type AgentVoiceClientToServerEvents,
  type AgentVoiceErrorCode,
  type AgentVoiceServerToClientEvents,
  type AgentVoiceStartAck,
} from '@bandeja/shared/agentVoiceRealtime';
import prisma from '../../../../config/database';
import { config } from '../../../../config/env';
import { loadActiveUser } from '../../../../middleware/authToken';
import { ApiError } from '../../../../utils/ApiError';
import { LLM_REASON } from '../../../ai/llmReasons';
import { getRedisClient, getRedisSubscriber } from '../../../redis/redisClient';
import { parseAgentClientCaps } from '../../clientExecution/clientCaps';
import { assertAgentBudget } from '../../agentGuards';
import { AgentMessageRateStore, nodeRedisAgentRatePort, type AgentRateRedisPort } from '../../agentMessageRateLimit';
import { recordVoiceUsage, vocabularyFor } from '../agentVoice.service';
import { agentVoiceTranscriptionCharge } from '../agentVoiceText';
import { resolveAgentVoiceRealtimeProviders } from './agentVoiceRealtimeProviders';
import {
  AgentVoiceRealtimeSession,
  type AgentVoiceDepError,
  type AgentVoiceEndReason,
  type AgentVoiceUsage,
} from './agentVoiceRealtimeSession';
import { defaultAgentVoiceRunPort, type AgentVoiceRunPort } from './agentVoiceRuns';

type VoiceSocket = Socket<AgentVoiceClientToServerEvents, AgentVoiceServerToClientEvents, Record<string, never>, VoiceSocketData>;
type VoiceSocketData = { userId?: string; isAdmin?: boolean; voiceSessionId?: string };

/** Cross-process "one session per user": `{ origin, userId, sessionId }` of the newest session. */
export const AGENT_VOICE_REPLACE_CHANNEL = 'pp:agent-voice:replace';
/** This process (its own replace messages are already applied locally). */
const PROCESS_ORIGIN = randomUUID();
/** One `voice:audio` message holds at most this much PCM (1 s); larger ones are dropped. */
const MAX_AUDIO_MESSAGE_BYTES = AGENT_VOICE_INPUT_SAMPLE_RATE * 2;

const startSchema = z
  .object({
    chatId: z.string().min(1).max(64),
    locale: z.string().max(16).optional(),
    inputSampleRate: z.literal(AGENT_VOICE_INPUT_SAMPLE_RATE),
    muted: z.boolean().optional(),
  })
  .strip();

const sessions = new Map<string, AgentVoiceRealtimeSession>();
const sessionsByUser = new Map<string, Set<string>>();
let runPort: AgentVoiceRunPort = defaultAgentVoiceRunPort;

/** Tests: a fake run port (null = the real one). */
export function setAgentVoiceRunPortForTests(port: AgentVoiceRunPort | null): void {
  runPort = port ?? defaultAgentVoiceRunPort;
}

/** Tests / diagnostics. */
export function agentVoiceActiveSessionCount(): number {
  return sessions.size;
}

function forget(session: AgentVoiceRealtimeSession): void {
  sessions.delete(session.id);
  const ids = sessionsByUser.get(session.userId);
  ids?.delete(session.id);
  if (ids && ids.size === 0) sessionsByUser.delete(session.userId);
}

/** Ends this process's other sessions of `userId`. */
function endOtherSessions(userId: string, keepSessionId: string): void {
  for (const id of [...(sessionsByUser.get(userId) ?? [])]) {
    if (id !== keepSessionId) sessions.get(id)?.end('replaced');
  }
}

export const AGENT_VOICE_START_RATE_PREFIX = 'pp:agent-voice:start-rate:';

export type AgentVoiceStartLimit = { ok: true } | { ok: false; retryAt?: string };

/**
 * Per-user `voice:start` limit (`AGENT_VOICE_REALTIME_START_RATE_LIMIT_MAX` per
 * `AGENT_VOICE_RATE_LIMIT_WINDOW_MS`): a fixed window shared by all processes in Redis when
 * configured (`pp:agent-voice:start-rate:<userId>`, the agent message store), else in memory.
 */
export function createAgentVoiceStartLimiter(
  redis: AgentRateRedisPort | null,
  limits: () => { windowMs: number; max: number } = () => ({
    windowMs: config.agentVoice.rateLimitWindowMs,
    max: config.agentVoice.realtime.startRateLimitMax,
  }),
) {
  const store = new AgentMessageRateStore(redis, AGENT_VOICE_START_RATE_PREFIX);
  let initializedWindowMs: number | null = null;
  return {
    async consume(userId: string): Promise<AgentVoiceStartLimit> {
      const { windowMs, max } = limits();
      if (initializedWindowMs !== windowMs) {
        store.init({ windowMs } as Options);
        initializedWindowMs = windowMs;
      }
      const info = await store.increment(userId);
      if (info.totalHits <= max) return { ok: true };
      return { ok: false, ...(info.resetTime ? { retryAt: info.resetTime.toISOString() } : {}) };
    },
    shutdown(): void {
      store.shutdown();
    },
  };
}

const startLimiter = createAgentVoiceStartLimiter(nodeRedisAgentRatePort());

export function classifyAgentVoiceError(error: unknown): AgentVoiceDepError {
  if (error instanceof ApiError) {
    const code = typeof error.data?.code === 'string' ? error.data.code : null;
    const retryAt = typeof error.data?.retryAt === 'string' ? error.data.retryAt : undefined;
    const known: AgentVoiceErrorCode[] = ['BUDGET_EXCEEDED', 'RATE_LIMITED', 'CHAT_BUSY', 'NOT_FOUND', 'VOICE_UNAVAILABLE'];
    if (code && (known as string[]).includes(code)) return { code: code as AgentVoiceErrorCode, message: error.message, ...(retryAt ? { retryAt } : {}) };
    if (error.statusCode === 404) return { code: 'NOT_FOUND', message: error.message };
    if (error.statusCode === 429) return { code: 'RATE_LIMITED', message: error.message, ...(retryAt ? { retryAt } : {}) };
    if (error.statusCode === 400) return { code: 'BAD_REQUEST', message: error.message };
    return { code: 'INTERNAL', message: error.message };
  }
  console.error('[agent-voice] unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
  return { code: 'INTERNAL', message: 'Something went wrong' };
}

async function budgetError(userId: string, isAdmin: boolean): Promise<AgentVoiceDepError | null> {
  try {
    await assertAgentBudget(userId, config.agent, new Date(), { isAdmin });
    return null;
  } catch (error) {
    return classifyAgentVoiceError(error);
  }
}

async function recordUsage(userId: string, sessionId: string, usage: AgentVoiceUsage): Promise<void> {
  const voiceConfig = config.agentVoice;
  if (usage.kind === 'speech') {
    await recordVoiceUsage({
      reason: LLM_REASON.AGENT_VOICE_SPEECH,
      userId,
      provider: usage.provider,
      model: usage.model,
      input: { chars: usage.amount, v: 2, sessionId },
      output: {},
      charge: usage.amount * Math.max(0, voiceConfig.ttsTokensPerChar),
      now: new Date(),
    });
    return;
  }
  const durationMs = Math.round(usage.amount);
  await recordVoiceUsage({
    reason: usage.kind === 'realtime_transcription' ? LLM_REASON.AGENT_VOICE_REALTIME_TRANSCRIPTION : LLM_REASON.AGENT_VOICE_TRANSCRIPTION,
    userId,
    provider: usage.provider,
    model: usage.model,
    input: { durationMs, v: 2, sessionId },
    output: {},
    charge: agentVoiceTranscriptionCharge(durationMs, voiceConfig.sttTokensPerSecond),
    now: new Date(),
  });
}

function toBuffer(chunk: unknown): Buffer | null {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);
  if (ArrayBuffer.isView(chunk)) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return null;
}

async function startSession(socket: VoiceSocket, payload: unknown): Promise<AgentVoiceStartAck> {
  const userId = socket.data.userId;
  if (!userId) return { ok: false, code: 'BAD_REQUEST', message: 'Not authenticated' };
  const parsed = startSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: 'BAD_REQUEST', message: 'Invalid voice:start payload' };
  const providers = resolveAgentVoiceRealtimeProviders();
  if (!providers) return { ok: false, code: 'VOICE_V2_UNAVAILABLE', message: 'Realtime voice is not available' };
  const limit = await startLimiter.consume(userId);
  if (!limit.ok) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many voice sessions. Try again in a few minutes.', ...(limit.retryAt ? { retryAt: limit.retryAt } : {}) };
  }
  const chat = await prisma.agentChat.findFirst({ where: { id: parsed.data.chatId, userId, deletedAt: null }, select: { id: true } });
  if (!chat) return { ok: false, code: 'NOT_FOUND', message: 'Chat not found' };
  const isAdmin = socket.data.isAdmin === true;
  const budget = await budgetError(userId, isAdmin);
  if (budget) return { ok: false, code: budget.code, ...(budget.message ? { message: budget.message } : {}), ...(budget.retryAt ? { retryAt: budget.retryAt } : {}) };
  if (!socket.connected) return { ok: false, code: 'BAD_REQUEST', message: 'Disconnected' };

  const auth = socket.handshake.auth as { clientCaps?: unknown } | undefined;
  const clientCaps =
    typeof auth?.clientCaps === 'string'
      ? parseAgentClientCaps(auth.clientCaps)
      : await runPort.latestClientCaps(userId, chat.id).catch(() => null);

  // One session per socket and per user.
  const previousId = socket.data.voiceSessionId;
  if (previousId) sessions.get(previousId)?.end('replaced');
  const sessionId = randomUUID();
  const voiceConfig = config.agentVoice;
  const session = new AgentVoiceRealtimeSession({
    sessionId,
    user: { id: userId, isAdmin },
    chatId: chat.id,
    locale: parsed.data.locale?.trim() || null,
    clientCaps,
    muted: parsed.data.muted === true,
    config: voiceConfig,
    providers,
    runs: runPort,
    emit: (event, data) => {
      (socket.emit as (event: string, data: unknown) => boolean)(event, data);
    },
    vocabulary: () => vocabularyFor(userId),
    checkBudget: () => budgetError(userId, isAdmin),
    recordUsage: (usage) => recordUsage(userId, sessionId, usage),
    classifyError: classifyAgentVoiceError,
    onEnded: (reason: AgentVoiceEndReason) => {
      forget(session);
      console.info(`[agent-voice] session end id=${sessionId} user=${userId} reason=${reason}`);
    },
  });
  sessions.set(sessionId, session);
  if (!sessionsByUser.has(userId)) sessionsByUser.set(userId, new Set());
  sessionsByUser.get(userId)!.add(sessionId);
  socket.data.voiceSessionId = sessionId;
  endOtherSessions(userId, sessionId);
  void publishReplace(userId, sessionId);
  console.info(`[agent-voice] session start id=${sessionId} user=${userId} chat=${chat.id}`);
  return { ok: true, sessionId, outputSampleRate: AGENT_VOICE_OUTPUT_SAMPLE_RATE, maxSessionMs: voiceConfig.realtime.maxSessionMs };
}

async function publishReplace(userId: string, sessionId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.publish(AGENT_VOICE_REPLACE_CHANNEL, JSON.stringify({ origin: PROCESS_ORIGIN, userId, sessionId }));
  } catch (error) {
    console.error('[agent-voice] replace publish failed', error);
  }
}

async function subscribeReplace(): Promise<void> {
  const sub = await getRedisSubscriber();
  if (!sub) return;
  try {
    await sub.subscribe(AGENT_VOICE_REPLACE_CHANNEL, (message) => {
      try {
        const { origin, userId, sessionId } = JSON.parse(message) as { origin?: string; userId?: string; sessionId?: string };
        if (origin !== PROCESS_ORIGIN && userId && sessionId) endOtherSessions(userId, sessionId);
      } catch {
        // malformed: ignore
      }
    });
  } catch (error) {
    console.error('[agent-voice] replace subscribe failed', error);
  }
}

function sessionOf(socket: VoiceSocket): AgentVoiceRealtimeSession | null {
  const id = socket.data.voiceSessionId;
  const session = id ? sessions.get(id) : undefined;
  return session && !session.isEnded ? session : null;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

export function registerAgentVoiceNamespace(io: SocketIOServer): Namespace {
  const nsp = io.of(AGENT_VOICE_NAMESPACE) as unknown as Namespace<
    AgentVoiceClientToServerEvents,
    AgentVoiceServerToClientEvents,
    Record<string, never>,
    VoiceSocketData
  >;

  nsp.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string } | undefined)?.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication error: No token provided'));
      const user = (await loadActiveUser(token)) as { id: string; isAdmin: boolean };
      socket.data.userId = user.id;
      socket.data.isAdmin = user.isAdmin === true;
      next();
    } catch {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  nsp.on('connection', (socket) => {
    socket.on('voice:start', (payload, ack) => {
      if (typeof ack !== 'function') return;
      startSession(socket, payload)
        .then((res) => {
          ack(res);
          if (res.ok) void sessions.get(res.sessionId)?.start();
        })
        .catch((error) => {
          const classified = classifyAgentVoiceError(error);
          ack({ ok: false, code: classified.code, ...(classified.message ? { message: classified.message } : {}) });
        });
    });
    socket.on('voice:audio', (chunk) => {
      const pcm = toBuffer(chunk);
      if (!pcm || pcm.length === 0 || pcm.length > MAX_AUDIO_MESSAGE_BYTES || pcm.length % 2 !== 0) return;
      sessionOf(socket)?.audio(pcm);
    });
    socket.on('voice:mute', (payload) => {
      const { muted } = asRecord(payload);
      if (typeof muted === 'boolean') sessionOf(socket)?.setMuted(muted);
    });
    socket.on('voice:interrupt', (payload) => {
      const { playedMs } = asRecord(payload);
      sessionOf(socket)?.interrupt(typeof playedMs === 'number' ? playedMs : undefined);
    });
    socket.on('voice:playback', (payload) => {
      const { turnId, playedMs, done } = asRecord(payload);
      if (typeof turnId !== 'string' || typeof playedMs !== 'number') return;
      sessionOf(socket)?.playback(turnId, playedMs, done === true);
    });
    socket.on('voice:follow-run', (payload) => {
      const { runId } = asRecord(payload);
      if (typeof runId === 'string' && runId.length <= 64) void sessionOf(socket)?.followRun(runId);
    });
    socket.on('voice:resume', () => sessionOf(socket)?.resume());
    socket.on('voice:timing', (payload) => {
      const { turnId, marks } = asRecord(payload);
      if (typeof turnId === 'string' && marks && typeof marks === 'object') {
        sessionOf(socket)?.clientTiming(turnId, marks as Record<string, number>);
      }
    });
    socket.on('voice:end', () => sessionOf(socket)?.end('user'));
    socket.on('disconnect', () => sessionOf(socket)?.end('user'));
  });

  void subscribeReplace();
  return nsp as unknown as Namespace;
}
