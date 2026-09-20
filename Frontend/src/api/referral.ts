import api from './axios';
import type { ApiResponse } from '@/types';

/** Mirrors `Backend/src/services/referral/referral.service.ts#ReferralInviteState`. */
export type ReferralInviteState = 'INVITED' | 'JOINED' | 'PLAYED';

export interface ReferralInvite {
  id: string;
  state: ReferralInviteState;
  /** `null` while the invite has not converted into an account yet. */
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  } | null;
  at: string;
  /** Coins the referrer received. `null` until the invite pays out. */
  rewardCoins: number | null;
}

export interface ReferralSummary {
  /** Canonical stored form, no dash. */
  code: string;
  /** `BNDJ-7K2Q` — the only form ever shown to a user. */
  displayCode: string;
  link: string;
  referrerReward: number;
  referredReward: number;
  rewardedCount: number;
  cap: number;
  capReached: boolean;
  invites: ReferralInvite[];
}

/** First name and avatar only — this is what the unauthenticated landing resolves. */
export interface ReferralPublicReferrer {
  found: boolean;
  firstName: string | null;
  avatar: string | null;
}

export interface ReferralStatus {
  referrer: { firstName: string | null; avatar: string | null } | null;
  /** The manual code field is only rendered while this is true. */
  canEnterCode: boolean;
  /** Past the 7-day window with no referrer — show the caption instead of the field. */
  windowClosed: boolean;
  referredReward: number;
}

export const referralApi = {
  getSummary: async (): Promise<ReferralSummary> => {
    const response = await api.get<ApiResponse<ReferralSummary>>('/referrals/me');
    return response.data.data;
  },

  getStatus: async (): Promise<ReferralStatus> => {
    const response = await api.get<ApiResponse<ReferralStatus>>('/referrals/me/status');
    return response.data.data;
  },

  /**
   * Manual code entry. Lives at `/referrals/me/code` rather than the PRD's
   * `/users/me/referral-code` because `/users` is owned by another router
   * (see `Backend/src/routes/referral.routes.ts`).
   */
  submitCode: async (code: string): Promise<{ referrer: { firstName: string | null; avatar: string | null } }> => {
    const response = await api.post<
      ApiResponse<{ referrer: { firstName: string | null; avatar: string | null } }>
    >('/referrals/me/code', { code });
    return response.data.data;
  },

  getGameInviteLink: async (gameId: string): Promise<{ link: string; code: string }> => {
    const response = await api.get<ApiResponse<{ link: string; code: string }>>(
      `/referrals/game-link/${gameId}`,
    );
    return response.data.data;
  },

  /** Unauthenticated — used by the Register screen before an account exists. */
  resolvePublic: async (code: string): Promise<ReferralPublicReferrer> => {
    const response = await api.get<ApiResponse<ReferralPublicReferrer>>(
      `/public/referral/${encodeURIComponent(code)}`,
    );
    return response.data.data;
  },
};
