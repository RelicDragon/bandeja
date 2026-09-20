import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@/types';
import { DEFAULT_SPORT } from '@shared/sport';
import { useAuthStore } from '@/store/authStore';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { SportQuestionnaireContent } from '@/components/sportQuestionnaire';
import { getSportQuestionnaireConfig } from '@/sport/sportQuestionnaireRegistry';
import { getSportConfig, getSportRatingModel } from '@/sport/sportRegistry';
import { getDisplayLevelForSport, resolveActivePrimarySport } from '@/utils/profileSports';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';

/**
 * PRD 350 step 3 — Your level.
 *
 * The existing per-sport questionnaire rendered inside the frame, followed by
 * onboarding's own result screen: the estimated level on the sport's display
 * scale, counted up, plus the one line that matters ("You can adjust this any
 * time in Profile."). Skipping leaves the level unset, so the existing Home
 * prompt stays in place — that is handled by the flow, not here.
 */
export function LevelStep(chrome: OnboardingStepChrome) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const sport = resolveActivePrimarySport(user) ?? DEFAULT_SPORT;
  const [result, setResult] = useState<User | null>(null);

  const hasQuestionnaire = Boolean(getSportQuestionnaireConfig(sport));
  const sportLabel = t(getSportConfig(sport).labelKey);
  const displaySystem = getSportRatingModel(sport).display?.system;

  if (result) {
    const level = getDisplayLevelForSport(result, sport);
    return (
      <OnboardingFrame
        {...chrome}
        step="level"
        onSkip={undefined}
        title={t('onboarding.level.resultTitle')}
        subtitle={t('onboarding.level.resultSubtitle', { sport: sportLabel })}
        primaryLabel={t('onboarding.level.continue')}
        onPrimary={chrome.onAdvance}
      >
        <div className="flex flex-col items-center gap-4 py-4" data-testid="onboarding-level-result">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary-50 text-5xl font-bold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
            <CountUpNumber value={level} decimals={1} />
          </div>
          {displaySystem && displaySystem !== 'NONE' ? (
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t('onboarding.level.scale', { scale: displaySystem })}
            </p>
          ) : null}
          <p className="max-w-xs text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {t('onboarding.level.adjustLater')}
          </p>
        </div>
      </OnboardingFrame>
    );
  }

  // No questionnaire for this sport: there is nothing to answer, so the step
  // degrades to a single explanatory screen rather than an empty frame.
  if (!hasQuestionnaire) {
    return (
      <OnboardingFrame
        {...chrome}
        step="level"
        title={t('onboarding.level.title')}
        subtitle={t('onboarding.level.unavailable', { sport: sportLabel })}
        primaryLabel={t('onboarding.level.continue')}
        onPrimary={chrome.onAdvance}
      >
        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {t('onboarding.level.adjustLater')}
        </p>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      {...chrome}
      step="level"
      title={t('onboarding.level.title')}
      subtitle={t('onboarding.level.subtitle', { sport: sportLabel })}
    >
      {/* The questionnaire owns its own Back / Next / Submit row, so the frame
          deliberately renders no primary button here. */}
      <SportQuestionnaireContent
        sport={sport}
        showStartOver={false}
        hideResultSlide
        onRequestClose={chrome.onSkip ?? chrome.onAdvance}
        onCompleted={(completed) => setResult(completed)}
      />
    </OnboardingFrame>
  );
}
