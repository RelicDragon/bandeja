import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { activeMemberTheme } from '@/utils/mainTheme';
import { MemberLoading } from '@/components/MemberLoading';

export const Loading = () => {
  const { t } = useTranslation();
  const theme = useAuthStore((s) => activeMemberTheme(s.user));

  if (theme) {
    return (
      <MemberLoading theme={theme} variant="inline" className="min-h-screen">
        <p className="member-loading-label">{t('app.loading')}</p>
      </MemberLoading>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-[3px] border-primary-600/25 border-t-primary-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
      </div>
    </div>
  );
};
