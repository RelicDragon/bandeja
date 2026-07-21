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
      <div className="flex w-full items-center gap-3 py-0.5">
        <div className="h-px flex-1 bg-slate-200/90 dark:bg-slate-600/80" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {t('auth.or')}
        </span>
        <div className="h-px flex-1 bg-slate-200/90 dark:bg-slate-600/80" />
      </div>
      <div className="flex w-full max-w-sm items-center justify-center gap-2 sm:gap-3">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block flex-1 transition-opacity hover:opacity-90 active:opacity-80"
        >
          <img
            src={badges.ios}
            alt={t('auth.downloadOnAppStore')}
            className="mx-auto h-9 w-full max-w-[148px] object-contain sm:h-10"
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
            className="mx-auto h-12 w-full max-w-[148px] object-contain sm:h-14"
          />
        </a>
      </div>
    </div>
  );
}
