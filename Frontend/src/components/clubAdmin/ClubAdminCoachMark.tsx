import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ClubAdminCoachMarkProps {
  show: boolean;
  message: string;
  stepLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}

export function ClubAdminCoachMark({
  show,
  message,
  stepLabel,
  onDismiss,
  children,
}: ClubAdminCoachMarkProps) {
  const { t } = useTranslation();

  if (!show) return <>{children}</>;

  return (
    <div className="relative z-20">
      {children}
      <div
        className="pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-primary-500 ring-offset-2 ring-offset-background"
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={stepLabel}
        className="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-primary-200 bg-primary-50 p-3 shadow-lg dark:border-primary-800 dark:bg-primary-950"
      >
        <p className="mb-1 text-xs font-medium text-primary-700 dark:text-primary-300">{stepLabel}</p>
        <p className="mb-2 text-sm text-foreground">{message}</p>
        <button type="button" className="btn-primary text-sm" onClick={onDismiss}>
          {t('clubAdmin.coachGotIt')}
        </button>
      </div>
    </div>
  );
}
