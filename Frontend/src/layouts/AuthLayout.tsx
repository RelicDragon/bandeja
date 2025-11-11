import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '@/components';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4" style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div className="fixed z-10" style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}>
        <LanguageSelector />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-600 dark:text-primary-400">
            {t('app.title')}
          </h1>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

