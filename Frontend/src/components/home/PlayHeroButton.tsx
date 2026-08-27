import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { CityModal } from '@/components';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { useAuthStore } from '@/store/authStore';
import { usePlayIntentContext } from '@/components/playIntent/PlayIntentContext';
import { PlayIntentLookingStrip } from '@/components/playIntent/PlayIntentLookingStrip';

/**
 * The My-tab hero. Always present. Doubles as the onboarding entry point:
 *
 * - No city yet   → tap opens {@link CityModal}; on city set, compose opens.
 * - City set      → "I want to play" button:
 *                    others looking → court lobby (spectator) with an
 *                    "I want to play too" CTA on top; otherwise → compose.
 * - Looking       → swaps in {@link PlayIntentLookingStrip} as a live status card.
 *
 * Must be mounted inside a `<PlayIntentProvider>` — it reads the provider via
 * {@link usePlayIntentContext}.
 */
export function PlayHeroButton() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [openCityModal, setOpenCityModal] = useState(false);

  const {
    enabled,
    looking,
    openCompose,
    openLobby,
    stopLooking,
    proposal,
    whenLabel,
    emptyPool,
    othersCount,
    stripMembers,
    proposalArrivalToken,
  } = usePlayIntentContext();

  // Active intent or incoming proposal → swap the hero for the live status card.
  if (enabled && looking) {
    return (
      <PlayIntentLookingStrip
        proposal={!!proposal}
        whenLabel={whenLabel}
        emptyPool={emptyPool}
        othersCount={othersCount}
        stripMembers={stripMembers}
        proposalArrivalToken={proposalArrivalToken}
        onOpenLobby={openLobby}
        onOpenProposal={openLobby}
        onConfirmStop={stopLooking}
      />
    );
  }

  const handleTap = () => {
    if (!user || user.cityIsSet !== true) {
      // City gate: set the city first, then open compose (CityModal's
      // onCityChanged fires after switchCity + updateUser, so the provider's
      // `enabled` will be true by the time openCompose runs).
      setOpenCityModal(true);
      return;
    }
    // Others are already looking → drop straight into the court lobby so the
    // user can see who's there, with an "I want to play too" CTA on top. An
    // empty lobby is not worth showing, so fall back to compose.
    if (othersCount > 0) {
      openLobby();
      return;
    }
    openCompose();
  };

  const handleCityChanged = () => {
    // User now has a city; open the compose sheet immediately.
    openCompose();
  };

  return (
    <>
      <AnimatedMount className="mb-3">
        <button
          type="button"
          onClick={handleTap}
          data-testid="play-hero-button"
          className="group flex w-full items-center gap-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 px-4 py-3.5 text-start shadow-sm transition-all hover:border-emerald-500/70 hover:shadow-md active:scale-[0.99] dark:border-emerald-500/30 dark:from-emerald-500/15 dark:to-emerald-500/5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition-transform group-hover:scale-105 dark:bg-emerald-600">
            <Zap className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold leading-tight text-foreground">
              {t('home.playHero')}
            </span>
            <span className="block truncate text-xs leading-snug text-muted-foreground">
              {t('home.playHeroHint')}
            </span>
          </span>
        </button>
      </AnimatedMount>

      <CityModal
        isOpen={openCityModal}
        onClose={() => setOpenCityModal(false)}
        onCityChanged={handleCityChanged}
      />
    </>
  );
}
