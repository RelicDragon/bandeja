import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { referralApi, type ReferralSummary, type ReferralStatus } from '@/api/referral';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { shareReferralLink } from './shareReferral';
import { withReferralParam } from './referralCode';

/**
 * PRD 351 — data hooks for every referral surface.
 *
 * All of them are authenticated. The pre-auth Register screen deliberately
 * does **not** use these: it has no token, and resolves `?ref=` through the
 * public endpoint instead (`useReferralCodeValidation`).
 */

const STALE_MS = 60_000;

export function useReferralSummary(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));
  return useQuery<ReferralSummary>({
    queryKey: queryKeys.referral.summary(),
    queryFn: referralApi.getSummary,
    enabled: enabled && isAuthenticated,
    staleTime: STALE_MS,
  });
}

export function useReferralStatus(enabled = true) {
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));
  return useQuery<ReferralStatus>({
    queryKey: queryKeys.referral.status(),
    queryFn: referralApi.getStatus,
    enabled: enabled && isAuthenticated,
    staleTime: STALE_MS,
  });
}

/** Submits a manually typed code for an account that already exists. */
export function useSubmitReferralCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => referralApi.submitCode(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.referral.all });
    },
  });
}

/**
 * The share action used by the invite card, the game share sheet and the
 * "invite a friend" empties.
 *
 * `busy` is exposed so a button can disable itself for the round trip — the OS
 * share sheet takes long enough on a cold start that a double tap is easy.
 */
export function useShareReferral() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const share = useCallback(
    async (url: string, message?: string) => {
      if (busy) return 'cancelled' as const;
      setBusy(true);
      try {
        return await shareReferralLink({ url, text: message ?? t('referral.shareMessage'), t });
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  return { share, busy };
}

/**
 * A link to one game that carries the viewer's referral code.
 *
 * Resolved locally from the summary the profile already loads, so opening the
 * share sheet on a game never waits on a network round trip. `gameUrl` is the
 * app's own share URL, so the sport/host/locale handling stays in one place.
 */
export function useGameInviteLink(gameUrl: string | null): string | null {
  const { data } = useReferralSummary(Boolean(gameUrl));
  if (!gameUrl) return null;
  if (!data?.code) return gameUrl;
  return withReferralParam(gameUrl, data.code);
}
