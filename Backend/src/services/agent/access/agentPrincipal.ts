/**
 * Who the AI agent acts as. Loaded from the DB at run start (and again before a
 * confirmed write) — never taken from model output. No agent tool accepts a user id
 * or actor argument; every handler authorizes against this object.
 */
import prisma from '../../../config/database';
import { AUTH_USER_SELECT, assertUserActive } from '../../../middleware/authToken';

export type AgentPrincipal = {
  userId: string;
  isAdmin: boolean;
  isTrainer: boolean;
  canCreateTournament: boolean;
  currentCityId: string | null;
  language: string | null;
  /**
   * Memory master switch at load time (`User.agentMemoryEnabled`, Phase 11). Only decides
   * whether the memory tools are listed; the memory service re-reads the flag on every call.
   */
  agentMemoryEnabled: boolean;
};

const AGENT_PRINCIPAL_SELECT = {
  id: AUTH_USER_SELECT.id,
  isActive: AUTH_USER_SELECT.isActive,
  isAdmin: AUTH_USER_SELECT.isAdmin,
  isTrainer: AUTH_USER_SELECT.isTrainer,
  currentCityId: AUTH_USER_SELECT.currentCityId,
  language: AUTH_USER_SELECT.language,
  canCreateTournament: true,
  agentMemoryEnabled: true,
} as const;

/**
 * Throws the same 401 ApiErrors as bearer auth (`auth.userNotFound` /
 * `auth.userInactive`) for a missing or deactivated account.
 */
export async function loadAgentPrincipal(userId: string): Promise<AgentPrincipal> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: AGENT_PRINCIPAL_SELECT,
  });
  assertUserActive(user);
  return {
    userId: user.id,
    isAdmin: user.isAdmin,
    isTrainer: user.isTrainer,
    canCreateTournament: user.canCreateTournament,
    currentCityId: user.currentCityId,
    language: user.language,
    agentMemoryEnabled: user.agentMemoryEnabled,
  };
}
