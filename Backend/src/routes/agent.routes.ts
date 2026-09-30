/**
 * `/api/agent` — AI agent chats (docs/domains/agent.md). REST + one SSE route.
 * All routes authenticate; everything but `GET /me` is behind the feature flag.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AGENT_MESSAGE_MAX_LENGTH } from '@bandeja/shared/agentContract';
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
 * is shared with the Telegram assistant (`agentMessageRateLimit.ts`): one bucket per user.
 */
const agentMessageLimiter = rateLimit({
  windowMs: config.agent.rateLimitWindowMs,
  limit: () => config.agent.rateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: agentMessageRateStore,
  keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: AGENT_RATE_LIMIT_MESSAGE,
    code: 'RATE_LIMITED',
  },
});
noteAgentMessageRateStoreInitialized(config.agent.rateLimitWindowMs);

router.use(authenticate);

router.get('/chats', agentController.listChats);
router.post('/chats', agentController.createChat);
router.get('/chats/:chatId', validateZod({ params: chatParams }), agentController.getChat);
router.patch(
  '/chats/:chatId',
  validateZod({
    params: chatParams,
    body: z.object({ title: z.string().trim().min(1).max(AGENT_CHAT_TITLE_MAX) }),
  }),
  agentController.patchChat,
);
router.delete('/chats/:chatId', validateZod({ params: chatParams }), agentController.deleteChat);
router.post(
  '/chats/:chatId/messages',
  agentMessageLimiter,
  validateZod({
    params: chatParams,
    body: z.object({ text: z.string().trim().min(1).max(AGENT_MESSAGE_MAX_LENGTH) }),
  }),
  agentController.postMessage,
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

export default router;
