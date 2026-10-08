import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User as UserIcon } from 'lucide-react';
import { InvitesSection } from '@/components/home';
import { useHomeInviteActions } from '@/components/home/useHomeInviteActions';
import { CityPromptBanner } from '@/components/home/CityPromptBanner';
import { PlayIntentProvider } from '@/components/playIntent/PlayIntentFindBar';
import { markBottomTabBarHidden } from '@/components/navigation/bottomTabReveal';
import { NoviceProgressRing, NoviceRankLadder } from '@/components/novice/welcome/NoviceProgress';
import { NoviceLockedFeaturesTeaser } from '@/components/novice/welcome/NoviceLockedFeaturesTeaser';
import { NoviceUnlockAllLink } from '@/components/novice/welcome/NoviceUnlockAllLink';
import { WelcomeChoices } from '@/components/novice/welcome/WelcomeChoices';
import { WelcomeUpcomingGameHero } from '@/components/novice/welcome/WelcomeUpcomingGameHero';
import { useAuthStore } from '@/store/authStore';
import { useMyGames } from '@/hooks/useMyGames';
import { useNovice } from '@/hooks/useNovice';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getViewerPrimarySport } from '@/utils/profileSports';
import type { Game } from '@/types';
import { fallbackToStillAvatar, userFaceSrc } from '@/utils/animatedAvatar';

/** Exit animation before "show me everything" swaps in the full shell. */
const UNLOCK_EXIT_MS = 320;

function pickUpcomingGame(games: Game[]): Game | null {
  const now = Date.now();
  const upcoming = games
    .filter((g) => g.entityType !== 'LEAGUE_SEASON')
    .filter((g) => g.status === 'STARTED' || (g.status === 'ANNOUNCED' && new Date(g.endTime ?? g.startTime).getTime() >= now))
    .sort((a, b) => {
      if (a.timeIsSet === false && b.timeIsSet !== false) return 1;
      if (a.timeIsSet !== false && b.timeIsSet === false) return -1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  return upcoming[0] ?? null;
}

/**
 * PRD 358 — a Newcomer's home. Full-screen (no header, no bottom tabs, no ads):
 * progress to Regular, the next game if there is one, invites, the two big
 * choices (play / learn), a teaser of what unlocks, and the unlock-all escape.
 * Rendered by MainPage on the home route only; every other route opens as usual.
 */
export function NoviceWelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = usePrefersReducedMotion();
  const user = useAuthStore((s) => s.user);
  const { rank, progress, countedGames } = useNovice();
  const primarySport = getViewerPrimarySport(user);
  const [, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  const { games, invites, unreadCounts, refetch } = useMyGames(user, setLoading);
  const { handleAcceptInvite, handleDeclineInvite, declineInviteModal, decliningInviteIds } =
    useHomeInviteActions(invites, refetch);
  const upcomingGame = useMemo(() => pickUpcomingGame(games), [games]);

  useEffect(() => {
    // No tab bar here: the next shell (Debut / unlock-all) slides its bar in.
    markBottomTabBarHidden();
  }, []);

  if (!user) return null;

  const firstName = user.firstName?.trim();
  const playExit = () =>
    new Promise<void>((resolve) => {
      if (reduceMotion) {
        resolve();
        return;
      }
      setLeaving(true);
      window.setTimeout(resolve, UNLOCK_EXIT_MS);
    });

  return (
    <motion.div
      className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950"
      animate={leaving ? { opacity: 0, scale: 0.97 } : { opacity: 1, scale: 1 }}
      transition={{ duration: UNLOCK_EXIT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
      data-testid="novice-welcome-page"
    >
      <div
        className="mx-auto w-full max-w-lg px-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
              {firstName ? t('novice.welcome.greeting', { name: firstName }) : t('novice.welcome.greetingNoName')}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('novice.welcome.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label={t('novice.welcome.profile')}
            data-testid="novice-welcome-profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            {user.avatar ? (
              <img src={userFaceSrc(user, { own: true }) ?? undefined} onError={fallbackToStillAvatar(user.avatar)} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserIcon size={22} className="text-gray-500 dark:text-gray-400" aria-hidden />
            )}
          </button>
        </header>

        <div className="space-y-6">
          <section
            className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-white p-4 shadow-sm dark:bg-gray-900"
            data-testid="novice-welcome-progress"
          >
            <NoviceProgressRing current={progress.current} target={progress.target} />
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                {t('novice.shell.progressToRegular', { current: progress.current, target: progress.target })}
              </p>
              <NoviceRankLadder rank={rank} />
            </div>
          </section>

          <CityPromptBanner />

          {upcomingGame ? (
            <WelcomeUpcomingGameHero
              game={upcomingGame}
              user={user}
              isFirst={countedGames === 0}
              unreadCount={unreadCounts[upcomingGame.id] ?? 0}
            />
          ) : null}

          {invites.length > 0 ? (
            <div id="home-invites-section">
              <InvitesSection
                invites={invites}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
                decliningInviteIds={decliningInviteIds}
              />
            </div>
          ) : null}

          <PlayIntentProvider cityId={user.currentCity?.id} sport={primarySport} acceptSharedDeepLinks>
            <WelcomeChoices />
          </PlayIntentProvider>

          <NoviceLockedFeaturesTeaser />

          <div className="flex justify-center">
            <NoviceUnlockAllLink onBeforeUnlock={playExit} onUnlockFailed={() => setLeaving(false)} />
          </div>
        </div>
      </div>
      {declineInviteModal}
    </motion.div>
  );
}
