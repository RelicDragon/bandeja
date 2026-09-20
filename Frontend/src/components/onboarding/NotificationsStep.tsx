import { pressScaleGuard } from '@/components/motion/pressScale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarClock, Mail, Search, Zap, type LucideIcon } from 'lucide-react';
import { isCapacitor } from '@/utils/capacitor';
import pushNotificationService from '@/services/pushNotificationService';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';

/** Where the flow lands after the last step. */
export const PLAY_INTENT_DESTINATION = '/?playIntentOpen=1';
export const BROWSE_DESTINATION = '/find';

export interface NotificationsStepProps extends OnboardingStepChrome {
  /** Finish the flow and route. Shows the "You're set" screen first. */
  onFinish: (destination: string) => void;
}

/**
 * PRD 350 step 6 — Notifications and first move.
 *
 * Two phases inside one step: explain *why* we would notify and ask for the
 * permission at that exact moment, then the closing choice. Web starts at the
 * choice — `pushNotificationService` is native-only, so offering an opt-in the
 * platform cannot honour would be a lie.
 */
export function NotificationsStep({ onFinish, ...chrome }: NotificationsStepProps) {
  const { t } = useTranslation();
  const supportsPush = isCapacitor();
  const [phase, setPhase] = useState<'permission' | 'choice'>(
    supportsPush ? 'permission' : 'choice',
  );
  const [requesting, setRequesting] = useState(false);

  const requestPermission = async () => {
    setRequesting(true);
    try {
      await pushNotificationService.ensureTokenSentToBackend({ requestPermission: true });
    } finally {
      setRequesting(false);
      setPhase('choice');
    }
  };

  if (phase === 'permission') {
    return (
      <OnboardingFrame
        {...chrome}
        step="notifications"
        title={t('onboarding.notifications.title')}
        subtitle={t('onboarding.notifications.subtitle')}
        primaryLabel={t('onboarding.notifications.turnOn')}
        primaryBusy={requesting}
        onPrimary={() => void requestPermission()}
        footerExtra={
          <button
            type="button"
            onClick={() => setPhase('choice')}
            data-testid="onboarding-notifications-later"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl px-4 text-sm font-semibold text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400"
          >
            {t('onboarding.notifications.later')}
          </button>
        }
      >
        <ul className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <ReasonRow
            icon={Mail}
            title={t('onboarding.notifications.reasonInvitesTitle')}
            description={t('onboarding.notifications.reasonInvitesBody')}
          />
          <ReasonRow
            icon={CalendarClock}
            title={t('onboarding.notifications.reasonRemindersTitle')}
            description={t('onboarding.notifications.reasonRemindersBody')}
          />
          <ReasonRow
            icon={Zap}
            title={t('onboarding.notifications.reasonSpotsTitle')}
            description={t('onboarding.notifications.reasonSpotsBody')}
          />
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('onboarding.notifications.controlHint')}
        </p>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      {...chrome}
      step="notifications"
      title={t('onboarding.finish.choiceTitle')}
      subtitle={t('onboarding.finish.choiceSubtitle')}
    >
      <div className="grid gap-3">
        <ChoiceCard
          icon={Zap}
          title={t('onboarding.finish.playSoonTitle')}
          description={t('onboarding.finish.playSoonBody')}
          testId="onboarding-finish-play"
          onClick={() => onFinish(PLAY_INTENT_DESTINATION)}
        />
        <ChoiceCard
          icon={Search}
          title={t('onboarding.finish.browseTitle')}
          description={t('onboarding.finish.browseBody')}
          testId="onboarding-finish-browse"
          onClick={() => onFinish(BROWSE_DESTINATION)}
        />
      </div>
    </OnboardingFrame>
  );
}

function ReasonRow({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
    </li>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  testId,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex min-h-[5.5rem] w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white p-4 text-start transition-all duration-150 hover:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.99] ${pressScaleGuard} dark:border-gray-700 dark:bg-gray-800 dark:focus-visible:ring-offset-gray-900`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="block text-sm leading-snug text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
    </button>
  );
}
