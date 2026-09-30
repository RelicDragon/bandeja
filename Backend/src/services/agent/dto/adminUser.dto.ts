/**
 * Admin-tool user shape (`admin_find_users`, `admin_get_user`; scope `admin` only).
 * Whitelist: identity (name, email), home city, account flags, per-sport level. Unlike
 * `user.dto.ts` it carries the email so an admin can tell accounts apart, but never
 * secrets or contact channels beyond that: no password hash, tokens, refresh sessions,
 * OTPs, push tokens, phone, Telegram / Apple / Google ids, wallet or payout data.
 * The admin services return much wider rows; only the fields below are copied.
 */
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import { agentUserDisplayName, roundLevel } from './user.dto';

/** The subset of an admin-service user row (`PROFILE_SELECT_FIELDS`) this DTO reads. */
export type AgentAdminUserSource = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar?: string | null;
  email: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isTrainer: boolean;
  canCreateTournament: boolean;
  canCreateLeague: boolean;
  maxParticipantsInGame: number;
  createdAt: Date;
  primarySport: string;
  currentCity: { id: string; name: string } | null;
  sportProfiles: { sport: string; level: number | null; gamesPlayed?: number | null }[];
  phone?: string | null;
  telegramId?: string | null;
  appleSub?: string | null;
  googleId?: string | null;
};

export type AgentAdminUserFlags = {
  isActive: boolean;
  isAdmin: boolean;
  isTrainer: boolean;
  canCreateTournament: boolean;
  canCreateLeague: boolean;
  maxParticipantsInGame: number;
};

export type AgentAdminUserSummary = {
  userId: string;
  name: string;
  email: string | null;
  city: { id: string; name: string } | null;
  flags: AgentAdminUserFlags;
  createdAt: string;
};

export type AgentAdminUserDetail = AgentAdminUserSummary & {
  primarySport: string;
  sports: { sport: string; level: number | null; gamesPlayed: number | null }[];
  /** Which sign-in methods are linked (booleans only, never the identifiers). */
  signIn: { phone: boolean; telegram: boolean; apple: boolean; google: boolean };
};

export function agentAdminUserFlags(row: AgentAdminUserSource): AgentAdminUserFlags {
  return {
    isActive: row.isActive,
    isAdmin: row.isAdmin,
    isTrainer: row.isTrainer,
    canCreateTournament: row.canCreateTournament,
    canCreateLeague: row.canCreateLeague,
    maxParticipantsInGame: row.maxParticipantsInGame,
  };
}

export function toAgentAdminUserSummary(row: AgentAdminUserSource): AgentAdminUserSummary {
  return {
    userId: row.id,
    name: agentUserDisplayName(row),
    email: row.email ?? null,
    city: row.currentCity ? { id: row.currentCity.id, name: row.currentCity.name } : null,
    flags: agentAdminUserFlags(row),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAgentAdminUserDetail(row: AgentAdminUserSource): AgentAdminUserDetail {
  return {
    ...toAgentAdminUserSummary(row),
    primarySport: row.primarySport,
    sports: row.sportProfiles.map((profile) => ({
      sport: profile.sport,
      level: roundLevel(profile.level),
      gamesPlayed: profile.gamesPlayed ?? null,
    })),
    signIn: {
      phone: Boolean(row.phone),
      telegram: Boolean(row.telegramId),
      apple: Boolean(row.appleSub),
      google: Boolean(row.googleId),
    },
  };
}

export function agentAdminUserEntity(row: AgentAdminUserSource): AgentEntityRef {
  return { type: 'user', id: row.id, name: agentUserDisplayName(row), avatar: row.avatar ?? null };
}
