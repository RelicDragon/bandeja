/**
 * `/api/agent` — AI agent chats (docs/domains/agent.md). REST + one SSE route.
 * All routes authenticate; everything but `GET /me` is behind the feature flag.
 */
import express, { Router } from 'express';
import rateLimit, { type AugmentedRequest } from 'express-rate-limit';
import { z } from 'zod';
import {
  AGENT_FEEDBACK_COMMENT_MAX_LENGTH,
  AGENT_MEMORY_BODY_MAX_LENGTH,
  AGENT_MESSAGE_MAX_LENGTH,
  AGENT_VOICE_MAX_AUDIO_BYTES,
  AGENT_VOICE_SPEECH_MAX_CHARS,
} from '@bandeja/shared/agentContract';
import { config } from '../config/env';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { validateZod } from '../middleware/validateZod';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { AGENT_CHAT_TITLE_MAX } from '../services/agent/agentChat.service';
import {
  AGENT_RATE_LIMIT_MESSAGE,
  agentMessageRateStore,
  noteAgentMessageRateStoreInitialized,
} from '../services/agent/agentMessageRateLimit';
import { agentClientReportBodySchema } from '../services/agent/clientExecution/clientReport';
import * as agentController from '../controllers/agent.controller';

const router = Router();

const idParam = z.string().trim().min(1).max(64);
const chatParams = z.object({ chatId: idParam });
const runParams = z.object({ runId: idParam });
const actionParams = z.object({ actionId: idParam });

/**
 * Per-user message limit (`AGENT_RATE_LIMIT_MAX` per `AGENT_RATE_LIMIT_WINDOW_MS`). The store
 * is shared with the Telegram assistant (`agentMessageRateLimit.ts`): one bucket per user,
 * in Redis when configured (all processes), else in memory.
 */
const agentMessageLimiter = rateLimit({
  windowMs: config.agent.rateLimitWindowMs,
  limit: () => config.agent.rateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: agentMessageRateStore,
  keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
  // `Retry-After` comes from the library (standard headers); `retryAt` is the same time as ISO.
  message: (req: express.Request) => {
    const resetTime = (req as AugmentedRequest).rateLimit?.resetTime;
    return {
      success: false,
      message: AGENT_RATE_LIMIT_MESSAGE,
      code: 'RATE_LIMITED',
      ...(resetTime ? { retryAt: resetTime.toISOString() } : {}),
    };
  },
});
noteAgentMessageRateStoreInitialized(config.agent.rateLimitWindowMs);

/** Voice: per-user limits (`AGENT_VOICE_*_RATE_LIMIT_MAX`); the daily token budget is the real cap. */
const voiceLimiter = (max: () => number) =>
  rateLimit({
    windowMs: config.agentVoice.rateLimitWindowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
    message: { success: false, message: 'Too many voice requests. Try again in a few minutes.', code: 'RATE_LIMITED' },
  });
const voiceTranscriptionLimiter = voiceLimiter(() => config.agentVoice.sttRateLimitMax);
const voiceSpeechLimiter = voiceLimiter(() => config.agentVoice.ttsRateLimitMax);
/** Raw audio upload: any `audio/*` body (format checked by the service). */
const rawAudioBody = express.raw({
  type: (req) => String(req.headers['content-type'] ?? '').toLowerCase().startsWith('audio/'),
  limit: AGENT_VOICE_MAX_AUDIO_BYTES,
});

router.use(authenticate);

router.get(
  '/chats',
  validateZod({ query: z.object({ archived: z.enum(['0', '1']).optional() }) }),
  agentController.listChats,
);
router.post('/chats', agentController.createChat);
router.get('/chats/:chatId', validateZod({ params: chatParams }), agentController.getChat);
router.patch(
  '/chats/:chatId',
  validateZod({
    params: chatParams,
    body: z
      .object({
        title: z.string().trim().min(1).max(AGENT_CHAT_TITLE_MAX).optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
      })
      .refine((body) => body.title !== undefined || body.pinned !== undefined || body.archived !== undefined, {
        message: 'Nothing to update',
      }),
  }),
  agentController.patchChat,
);
// Bare DELETE archives (store builds); `?mode=delete` is the soft delete.
router.delete(
  '/chats/:chatId',
  validateZod({ params: chatParams, query: z.object({ mode: z.enum(['delete', 'archive']).optional() }) }),
  agentController.deleteChat,
);
router.post(
  '/chats/:chatId/messages',
  agentMessageLimiter,
  validateZod({
    params: chatParams,
    // `editMessageId`: rewind to that USER message (it and everything after are dropped) and resend.
    body: z.object({
      text: z.string().trim().min(1).max(AGENT_MESSAGE_MAX_LENGTH),
      editMessageId: idParam.optional(),
      // Voice-conversation turn: the reply is written to be read aloud (docs/domains/agent.md § Voice).
      voice: z.boolean().optional(),
    }),
  }),
  agentController.postMessage,
);

// Thumbs on an assistant reply (owner's ASSISTANT messages only; else 404). `rating: null` clears.
router.put(
  '/chats/:chatId/messages/:messageId/feedback',
  validateZod({
    params: z.object({ chatId: idParam, messageId: idParam }),
    body: z
      .object({
        rating: z.enum(['up', 'down']).nullable(),
        comment: z.string().max(AGENT_FEEDBACK_COMMENT_MAX_LENGTH).optional(),
      })
      .strict(),
  }),
  agentController.setMessageFeedback,
);

// Voice (docs/domains/agent.md § Voice): raw audio in → transcript; text in → audio/mpeg.
router.post(
  '/voice/transcriptions',
  voiceTranscriptionLimiter,
  rawAudioBody,
  validateZod({ query: z.object({ durationMs: z.coerce.number().int().min(0).max(24 * 60 * 60 * 1000).optional() }) }),
  agentController.transcribeVoice,
);
router.post(
  '/voice/speech',
  voiceSpeechLimiter,
  validateZod({ body: z.object({ text: z.string().trim().min(1).max(AGENT_VOICE_SPEECH_MAX_CHARS) }).strict() }),
  agentController.speakVoice,
);

router.get('/runs/:runId/events', validateZod({ params: runParams }), agentController.streamRunEvents);
router.post('/runs/:runId/cancel', validateZod({ params: runParams }), agentController.cancelRun);

router.post(
  '/actions/:actionId/confirm',
  validateZod({
    params: actionParams,
    body: z.object({ remember: z.literal('always').optional() }).optional(),
  }),
  agentController.confirmAction,
);
router.post('/actions/:actionId/reject', validateZod({ params: actionParams }), agentController.rejectAction);
// Client-executed actions (booking plan §14.5): the app claims a lease, runs the provider write, reports.
router.post(
  '/actions/:actionId/claim',
  validateZod({ params: actionParams, body: z.object({ clientKey: z.string().trim().min(8).max(128) }) }),
  agentController.claimAction,
);
router.post(
  '/actions/:actionId/report',
  validateZod({ params: actionParams, body: agentClientReportBodySchema }),
  agentController.reportAction,
);

// Tool permissions (plan §15): the user's own rows only.
const toolParams = z.object({ toolName: z.string().trim().min(1).max(64) });
router.get('/permissions', agentController.listToolPermissions);
router.delete('/permissions', agentController.resetToolPermissions);
router.put(
  '/permissions/:toolName',
  validateZod({ params: toolParams, body: z.object({ mode: z.enum(['ASK', 'ALWAYS_ALLOW']) }) }),
  agentController.setToolPermission,
);
router.delete('/permissions/:toolName', validateZod({ params: toolParams }), agentController.resetToolPermission);

// Memory (Phase 11): the user's own rows only. Add / edit
// while the switch is OFF → 409 MEMORY_DISABLED; delete / clear always allowed.
const memoryItemParams = z.object({ id: idParam });
const memoryText = z.string().trim().min(1).max(AGENT_MEMORY_BODY_MAX_LENGTH);
const memoryTextBody = z.object({ text: memoryText }).strict();
// Undo of a delete puts the item back with its own name / description / type / source.
const memoryAddBody = z
  .object({
    text: memoryText,
    restore: z
      .object({
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().min(1).max(160),
        type: z.enum(['PREFERENCE', 'FEEDBACK', 'FACT']),
        source: z.enum(['USER_ASKED', 'MODEL_INFERRED']),
      })
      .strict()
      .optional(),
  })
  .strict();
router.get('/memory', agentController.getMemory);
router.put(
  '/memory/settings',
  validateZod({ body: z.object({ enabled: z.boolean() }).strict() }),
  agentController.setMemorySettings,
);
router.post('/memory/items', validateZod({ body: memoryAddBody }), agentController.addMemoryItem);
router.patch(
  '/memory/items/:id',
  validateZod({ params: memoryItemParams, body: memoryTextBody }),
  agentController.updateMemoryItem,
);
router.delete('/memory/items/:id', validateZod({ params: memoryItemParams }), agentController.deleteMemoryItem);
router.delete('/memory/items', agentController.clearMemoryItems);

export default router;
