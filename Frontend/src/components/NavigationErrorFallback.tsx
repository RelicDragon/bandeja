import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { handleBack } from '@/utils/backNavigation';

interface NavigationErrorFallbackProps {
  onClearPending: () => void;
  onRecover: () => void;
}

export function NavigationErrorFallback({ onClearPending, onRecover }: NavigationErrorFallbackProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleBackClick = () => {
    onClearPending();
    handleBack(navigate, onRecover);
  };

  const handleTryAgainClick = () => {
    onClearPending();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white px-6 py-8 text-center shadow-lg shadow-gray-900/5 dark:border-gray-700/80 dark:bg-gray-800 dark:shadow-black/20">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
          {t('errors.generic', { defaultValue: 'Something went wrong' })}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {t('errors.navigationError', {
            defaultValue: "This page didn't load correctly. Go back or try again.",
          })}
        </p>
        <div
          className="mx-auto mt-6 h-9 w-9 animate-spin rounded-full border-[3px] border-primary-600/25 border-t-primary-600"
          aria-hidden
        />
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto sm:min-w-[8.5rem]"
            onClick={handleBackClick}
          >
            <ArrowLeft size={18} aria-hidden />
            {t('common.back', { defaultValue: 'Back' })}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto sm:min-w-[8.5rem]"
            onClick={handleTryAgainClick}
          >
            <RefreshCw size={18} aria-hidden />
            {t('errors.tryAgain', { defaultValue: 'Try again' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
