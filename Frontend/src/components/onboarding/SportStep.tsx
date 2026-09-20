import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import { ALL_SPORTS, type Sport } from '@shared/sport';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useAuthStore } from '@/store/authStore';
import { listEnabledSports, resolveActivePrimarySport } from '@/utils/profileSports';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';
import { persistSportSelection } from './persistSportSelection';
import {
  canContinueFromSportStep,
  makeSportPrimary,
  resolveSubmittedPrimary,
  toggleSport,
  type SportSelection,
} from './sportSelection';
import { getSportAccentColor } from './sportAccent';

/** Long-press that moves the "Primary" tag. Mirrored by the Make primary action. */
const LONG_PRESS_MS = 550;

export interface SportStepProps extends OnboardingStepChrome {
  /**
   * `true` when the user has finished onboarding but has no enabled sport, so
   * the flow shows this step alone with a different headline.
   */
  sportOnly?: boolean;
}

/**
 * PRD 350 step 2 — Sport.
 *
 * Six tiles from the sport registry art. Multi-select; the first tap sets the
 * primary, and the "Primary" tag moves on long-press or through the explicit
 * **Make primary** action (the keyboard- and screen-reader-accessible path).
 * Continue unlocks after one selection.
 */
export function SportStep({ sportOnly = false, ...chrome }: SportStepProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [selection, setSelection] = useState<SportSelection>(() => ({
    selected: listEnabledSports(user),
    primary: resolveActivePrimarySport(user) ?? listEnabledSports(user)[0] ?? null,
  }));
  const [saving, setSaving] = useState(false);
  const { selected, primary } = selection;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    [],
  );

  const toggle = useCallback((sport: Sport) => {
    setSelection((current) => toggleSport(current, sport));
  }, []);

  const makePrimary = useCallback((sport: Sport) => {
    setSelection((current) => makeSportPrimary(current, sport));
  }, []);

  const startLongPress = (sport: Sport) => {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      makePrimary(sport);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const handleTileClick = (sport: Sport) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    toggle(sport);
  };

  const handleContinue = async () => {
    const primarySport = resolveSubmittedPrimary(selection);
    if (!primarySport || saving) return;
    setSaving(true);
    try {
      const updated = await persistSportSelection(user, selected, primarySport);
      updateUser(updated);
      chrome.onAdvance();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('onboarding.errors.saveFailed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const accent = getSportAccentColor(primary);

  return (
    <OnboardingFrame
      {...chrome}
      step="sport"
      accentColor={accent}
      title={sportOnly ? t('onboarding.sport.titleSportOnly') : t('onboarding.sport.title')}
      subtitle={t('onboarding.sport.subtitle')}
      primaryLabel={t('onboarding.sport.continue')}
      primaryDisabled={!canContinueFromSportStep(selection)}
      primaryBusy={saving}
      onPrimary={() => void handleContinue()}
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ALL_SPORTS.map((sport) => {
          const isSelected = selected.includes(sport);
          const isPrimary = isSelected && primary === sport;
          const label = t(getSportConfig(sport).labelKey);
          return (
            <li key={sport}>
              <button
                type="button"
                aria-pressed={isSelected}
                data-testid={`onboarding-sport-${sport}`}
                onClick={() => handleTileClick(sport)}
                onPointerDown={() => startLongPress(sport)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onContextMenu={(event) => event.preventDefault()}
                className={`relative flex min-h-[7rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98] dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard} ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/40'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                }`}
                style={isSelected ? { borderColor: getSportAccentColor(sport) } : undefined}
              >
                <img src={getSportPublicIcon(sport)} alt="" aria-hidden className="h-10 w-10 object-contain" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
                {isPrimary ? (
                  <span
                    data-testid={`onboarding-sport-primary-tag-${sport}`}
                    className="absolute end-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: getSportAccentColor(sport) }}
                  >
                    <Star className="h-3 w-3" aria-hidden />
                    {t('onboarding.sport.primaryTag')}
                  </span>
                ) : null}
              </button>
              {isSelected && !isPrimary ? (
                <button
                  type="button"
                  onClick={() => makePrimary(sport)}
                  data-testid={`onboarding-sport-make-primary-${sport}`}
                  className="mt-1 inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-xl px-2 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:bg-primary-950/40"
                >
                  {t('onboarding.sport.makePrimary', { sport: label })}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {t('onboarding.sport.primaryHint')}
      </p>
    </OnboardingFrame>
  );
}
