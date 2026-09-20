import { useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, UserPlus } from 'lucide-react';
import { favoritesApi, onboardingApi, type SuggestedUser } from '@/api';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PremiumName } from '@/components/PremiumName';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import {
  formatSportLevelBadgeDisplay,
  resolveActivePrimarySport,
} from '@/utils/profileSports';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';
import {
  EMPTY_FOLLOW_STATE,
  areAllFollowed,
  canFollow,
  isFollowing as isUserFollowing,
  markFollowing,
  rollbackFollow,
  settleFollow,
  type FollowState,
} from './followSelection';

const SUGGESTION_LIMIT = 8;
/** PRD: the Follow pill flips to Following with a 200 ms scale. */
const PILL_TRANSITION_S = 0.2;

/**
 * PRD 350 step 5 — People to follow.
 *
 * 6–8 suggestions from `GET /users/suggested`, each with a Follow pill that
 * flips to Following, plus a Follow all shortcut. Follows are optimistic and
 * survive a flaky connection: a failed request rolls the single pill back and
 * toasts, it never blocks the step.
 */
export function FollowStep(chrome: OnboardingStepChrome) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const reducedMotion = usePrefersReducedMotion();

  const cityId = user?.currentCity?.id;
  const sport = resolveActivePrimarySport(user) ?? undefined;

  const [follows, setFollows] = useState<FollowState>(EMPTY_FOLLOW_STATE);
  const followsRef = useRef(follows);
  followsRef.current = follows;

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.onboarding.suggestedUsers(cityId, sport, SUGGESTION_LIMIT),
    queryFn: () => onboardingApi.getSuggestedUsers({ cityId, sport, limit: SUGGESTION_LIMIT }),
    enabled: Boolean(cityId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);

  const follow = useCallback(
    async (userId: string) => {
      // Read through the ref: "Follow all" fires a whole list in one tick, so
      // the guard has to see the writes the previous iteration just made.
      if (!canFollow(followsRef.current, userId)) return;
      followsRef.current = markFollowing(followsRef.current, userId);
      setFollows(followsRef.current);
      try {
        await favoritesApi.addUserToFavorites(userId);
        setFollows((current) => settleFollow(current, userId));
      } catch {
        setFollows((current) => rollbackFollow(current, userId));
        toast.error(t('onboarding.follow.followFailed'));
      }
    },
    [t],
  );

  const followAll = useCallback(() => {
    for (const suggestion of suggestions) {
      void follow(suggestion.user.id);
    }
  }, [follow, suggestions]);

  const allFollowed = areAllFollowed(
    suggestions.map((row) => row.user.id),
    follows,
  );

  return (
    <OnboardingFrame
      {...chrome}
      step="follow"
      title={t('onboarding.follow.title')}
      subtitle={t('onboarding.follow.subtitle')}
      primaryLabel={t('onboarding.follow.continue')}
      onPrimary={chrome.onAdvance}
      footerExtra={
        suggestions.length > 0 && !allFollowed ? (
          <button
            type="button"
            onClick={followAll}
            data-testid="onboarding-follow-all"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
          >
            {t('onboarding.follow.followAll')}
          </button>
        ) : null
      }
    >
      {suggestionsQuery.isPending && cityId ? (
        <ul className="space-y-2" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className={`${shimmerBlock} h-16 w-full rounded-2xl`} />
          ))}
        </ul>
      ) : suggestions.length === 0 ? (
        <EmptyStateCard
          icon={UserPlus}
          title={t('onboarding.follow.emptyTitle')}
          description={t('onboarding.follow.emptyDescription')}
        />
      ) : (
        <ul className="space-y-2" data-testid="onboarding-follow-list">
          {suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.user.id}
              suggestion={suggestion}
              isFollowing={isUserFollowing(follows, suggestion.user.id)}
              isPending={!canFollow(follows, suggestion.user.id)}
              reducedMotion={reducedMotion}
              onFollow={() => void follow(suggestion.user.id)}
            />
          ))}
        </ul>
      )}
    </OnboardingFrame>
  );
}

function SuggestionRow({
  suggestion,
  isFollowing,
  isPending,
  reducedMotion,
  onFollow,
}: {
  suggestion: SuggestedUser;
  isFollowing: boolean;
  isPending: boolean;
  reducedMotion: boolean;
  onFollow: () => void;
}) {
  const { t } = useTranslation();
  const player = suggestion.user;
  const sport = resolveActivePrimarySport(player);
  const level = sport ? formatSportLevelBadgeDisplay(player, sport) : '-';
  const fullName = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-800">
      <PlayerAvatar player={player} extrasmall fullHideName subscribePresence={false} asDiv />
      <div className="min-w-0 flex-1">
        <PremiumName
          user={player}
          className="block truncate text-sm font-semibold text-gray-900 dark:text-white"
        >
          {fullName || t('onboarding.follow.unnamedPlayer')}
        </PremiumName>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {level !== '-' ? (
            <span className="me-2 inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-semibold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {level}
            </span>
          ) : null}
          {t('onboarding.follow.gamesThisMonth', { count: suggestion.gamesThisMonth })}
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onFollow}
        disabled={isFollowing || isPending}
        aria-pressed={isFollowing}
        data-testid={`onboarding-follow-${player.id}`}
        animate={{ scale: 1 }}
        initial={false}
        whileTap={reducedMotion ? undefined : { scale: 0.94 }}
        transition={{ duration: reducedMotion ? 0 : PILL_TRANSITION_S }}
        className={`inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
          isFollowing
            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
      >
        {isFollowing ? (
          <>
            <Check className="h-4 w-4" aria-hidden />
            {t('onboarding.follow.following')}
          </>
        ) : (
          t('onboarding.follow.follow')
        )}
      </motion.button>
    </li>
  );
}
