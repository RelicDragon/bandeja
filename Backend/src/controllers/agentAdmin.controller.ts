/** Admin read-only audit of the AI agent (`/api/admin/agent/*`, behind `requireAdmin`). */
import type { Response } from 'express';
import type { AgentActionStatus } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { getValidatedRequestPart } from '../middleware/validateZod';
import { asyncHandler } from '../utils/asyncHandler';
import type { AgentMessageFeedback } from '@bandeja/shared/agentContract';
import { agentUsageForAdmin, listAgentActionsForAdmin, listAgentHelpMissesForAdmin } from '../services/agent/agentAudit.service';
import { listAgentFeedbackForAdmin } from '../services/agent/agentMessageFeedback.service';

export const getAdminAgentActions = asyncHandler<AuthRequest>(async (req, res: Response) => {
  const query = getValidatedRequestPart<{ userId?: string; status?: AgentActionStatus; limit: number }>(req, 'query');
  const actions = await listAgentActionsForAdmin(query);
  res.json({ success: true, data: { actions } });
});

export const getAdminAgentUsage = asyncHandler<AuthRequest>(async (req, res: Response) => {
  const query = getValidatedRequestPart<{ userId?: string; days: number }>(req, 'query');
  const data = await agentUsageForAdmin(query);
  res.json({ success: true, data });
});

export const getAdminAgentFeedback = asyncHandler<AuthRequest>(async (req, res: Response) => {
  const query = getValidatedRequestPart<{ rating: AgentMessageFeedback; limit: number; userId?: string }>(req, 'query');
  const feedback = await listAgentFeedbackForAdmin(query);
  res.json({ success: true, data: { feedback } });
});

/** Help topics the assistant asked `get_help` for and did not find (`tools/help.tools.ts`). */
export const getAdminAgentHelpMisses = asyncHandler<AuthRequest>(async (req, res: Response) => {
  const query = getValidatedRequestPart<{ days: number }>(req, 'query');
  const data = await listAgentHelpMissesForAdmin(query);
  res.json({ success: true, data });
});
