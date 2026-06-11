import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { Button } from '@/components';

interface SubscriptionsNudgeButtonProps {
  onClick: () => void;
}

export const SubscriptionsNudgeButton = ({ onClick }: SubscriptionsNudgeButtonProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex justify-center">
      <Button variant="primary" size="sm" onClick={onClick} className="flex items-center gap-2">
        <div className="relative inline-flex items-center justify-center w-4 h-4">
          <Bell className="w-4 h-4 animate-bell-pulse relative z-10" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-1"></div>
            <div className="absolute w-8 h-8 rounded-full border-2 border-current opacity-0 animate-ring-2"></div>
          </div>
        </div>
        {t('gameSubscriptions.wantToBeNotified', {
          defaultValue: 'Want to be notified when new games are created?',
        })}
      </Button>
    </div>
  );
};
