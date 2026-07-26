import { useTranslation } from 'react-i18next';
import { RotateCcw, WifiOff } from 'lucide-react';
import { Button } from '@/components';
import { EmptyStateCard } from './EmptyStateCard';

interface FindDayLoadErrorEmptyProps {
  onRetry: () => void | Promise<void>;
}

export function FindDayLoadErrorEmpty({ onRetry }: FindDayLoadErrorEmptyProps) {
  const { t } = useTranslation();

  return (
    <EmptyStateCard
      icon={WifiOff}
      title={t('home.dayGamesLoadFailed', {
        defaultValue: "Couldn't load games for this day",
      })}
      description={t('home.dayGamesLoadFailedHint', {
        defaultValue: 'Check your connection and try again.',
      })}
      action={
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => void onRetry()}
          className="inline-flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      }
    />
  );
}
