import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { usesPremiumTheme } from '@/utils/mainTheme';

export const Loading = () => {
  const { t } = useTranslation();
  const premium = useAuthStore((s) => usesPremiumTheme(s.user));

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        {premium
          ? <img src="/premium/bandeja-gold-crest.webp" alt="" className="mx-auto h-24 w-36 object-contain animate-splash-logo" />
          : <div className="inline-block animate-spin rounded-full h-12 w-12 border-[3px] border-primary-600/25 border-t-primary-600"></div>}
        <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
      </div>
    </div>
  );
};
