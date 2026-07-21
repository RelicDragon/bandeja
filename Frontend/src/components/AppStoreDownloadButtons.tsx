import { useTranslation } from 'react-i18next';
import { APP_STORE_URL, PLAY_STORE_URL, getStoreBadgeUrls } from '@/utils/appStoreLinks';

interface AppStoreDownloadButtonsProps {
  className?: string;
}

export function AppStoreDownloadButtons({ className = '' }: AppStoreDownloadButtonsProps) {
  const { t, i18n } = useTranslation();
  const badges = getStoreBadgeUrls(i18n.language);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`.trim()}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {t('auth.getTheApp')}
      </p>
      <div className="flex w-full max-w-[280px] items-center justify-center gap-2">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block flex-1 transition-opacity hover:opacity-90 active:opacity-80"
        >
          <img
            src={badges.ios}
            alt={t('auth.downloadOnAppStore')}
            className="h-10 w-full object-contain"
          />
        </a>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block flex-1 transition-opacity hover:opacity-90 active:opacity-80"
        >
          <img
            src={badges.android}
            alt={t('auth.getItOnGooglePlay')}
            className="h-14 w-full object-contain"
          />
        </a>
      </div>
    </div>
  );
}
