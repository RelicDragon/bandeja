/**
 * Agent-facing user shapes. Whitelist only: a user is what a public profile card shows
 * (name, avatar, trainer flag, per-sport level). Never email, phone, Telegram ids or
 * usernames, wallet, city, payment data or tokens. See docs/plans/ai-agent.md §0.5.
 */
import type { Prisma, Sport } from '@prisma/client';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';

/** Prisma select for every user the agent may show. Keep in sync with `AgentUserCard`. */
export const AGENT_USER_CARD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  isTrainer: true,
  primarySport: true,
  sportProfiles: { select: { sport: true, level: true } },
} satisfies Prisma.UserSelect;

export type AgentUserCardRow = Prisma.UserGetPayload<{ select: typeof AGENT_USER_CARD_SELECT }>;

export type AgentUserCard = {
  userId: string;
  name: string;
  isTrainer: boolean;
  /** Level for the sport in context (game sport, else the user's primary sport). */
  level: number | null;
};

export function agentUserDisplayName(user: { firstName: string | null; lastName: string | null }): string {
  const name = [user.firstName, user.lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return name || 'Player';
}

export function roundLevel(level: number | null | undefined): number | null {
  if (level == null || !Number.isFinite(level)) return null;
  return Math.round(level * 100) / 100;
}

export function levelForSport(
  row: Pick<AgentUserCardRow, 'primarySport' | 'sportProfiles'>,
  sport?: Sport | null,
): number | null {
  const target = sport ?? row.primarySport;
  return roundLevel(row.sportProfiles.find((profile) => profile.sport === target)?.level);
}

export function toAgentUserCard(row: AgentUserCardRow, sport?: Sport | null): AgentUserCard {
  return {
    userId: row.id,
    name: agentUserDisplayName(row),
    isTrainer: row.isTrainer,
    level: levelForSport(row, sport),
  };
}

export function agentUserEntity(row: AgentUserCardRow): Extract<AgentEntityRef, { type: 'user' }> {
  return { type: 'user', id: row.id, name: agentUserDisplayName(row), avatar: row.avatar ?? null };
}

/** `get_player`: the public profile card (GET /users/:id/stats top block), trimmed. */
export const AGENT_PLAYER_PROFILE_SELECT = {
  ...AGENT_USER_CARD_SELECT,
  isActive: true,
  bio: true,
  verbalStatus: true,
  sportsEnabled: true,
  sportProfiles: { select: { sport: true, level: true, gamesPlayed: true, gamesWon: true } },
} satisfies Prisma.UserSelect;

export type AgentPlayerProfileRow = Prisma.UserGetPayload<{ select: typeof AGENT_PLAYER_PROFILE_SELECT }>;

export function toAgentPlayerProfile(row: AgentPlayerProfileRow) {
  return {
    userId: row.id,
    name: agentUserDisplayName(row),
    isTrainer: row.isTrainer,
    bio: row.bio ?? null,
    status: row.verbalStatus ?? null,
    primarySport: row.primarySport,
    sports: row.sportProfiles
      .filter((profile) => row.sportsEnabled.includes(profile.sport) || profile.sport === row.primarySport)
      .map((profile) => ({
        sport: profile.sport,
        level: roundLevel(profile.level),
        gamesPlayed: profile.gamesPlayed,
        gamesWon: profile.gamesWon,
      })),
  };
}
