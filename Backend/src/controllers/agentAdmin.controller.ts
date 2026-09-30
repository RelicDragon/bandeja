/** Admin read-only audit of the AI agent (`/api/admin/agent/*`, behind `requireAdmin`). */
import type { Response } from 'express';
import type { AgentActionStatus } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import { getValidatedRequestPart } from '../middleware/validateZod';
import { asyncHandler } from '../utils/asyncHandler';
import { agentUsageForAdmin, listAgentActionsForAdmin } from '../services/agent/agentAudit.service';

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
