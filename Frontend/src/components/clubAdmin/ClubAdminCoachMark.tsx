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

  return (
    <>
      {show && (
        <div
          role="dialog"
          aria-label={stepLabel}
          className="mb-2 rounded-xl border border-primary/20 bg-primary/5 p-3 dark:bg-primary/10"
        >
          <p className="mb-1 text-xs font-medium text-primary-700 dark:text-primary-300">{stepLabel}</p>
          <p className="mb-2 text-sm text-foreground">{message}</p>
          <button type="button" className="btn-primary text-sm" onClick={onDismiss}>
            {t('clubAdmin.coachGotIt')}
          </button>
        </div>
      )}
      {children}
    </>
  );
}
