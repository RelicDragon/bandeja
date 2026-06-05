import { ExternalLink, Phone, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { getTelUrl } from '@/utils/telUrl';

type CourtLocationLinksProps = {
  club?: { website?: string | null; phone?: string | null } | null;
  court?: { webCameraUrl?: string | null } | null;
  className?: string;
  linkClassName?: string;
  iconSize?: number;
  showWebCameraLabel?: boolean;
};

export function CourtLocationLinks({
  club,
  court,
  className = 'flex flex-wrap items-center gap-x-4 gap-y-1',
  linkClassName = 'flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline',
  iconSize = 14,
  showWebCameraLabel = true,
}: CourtLocationLinksProps) {
  const { t } = useTranslation();
  const website = club?.website?.trim();
  const telHref = club?.phone?.trim() ? getTelUrl(club.phone.trim()) : '';
  const webCameraUrl = court?.webCameraUrl?.trim();

  if (!website && !telHref && !webCameraUrl) return null;

  return (
    <div className={className}>
      {website ? (
        <button type="button" onClick={() => openExternalUrl(website)} className={linkClassName}>
          <ExternalLink size={iconSize} />
          {t('common.openWebsite')}
        </button>
      ) : null}
      {telHref ? (
        <a href={telHref} className={linkClassName}>
          <Phone size={iconSize} />
          {t('common.call')}
        </a>
      ) : null}
      {webCameraUrl ? (
        <button
          type="button"
          onClick={() => openExternalUrl(webCameraUrl)}
          className={linkClassName}
          title={t('common.openWebCamera')}
        >
          <QrCode size={iconSize} />
          {showWebCameraLabel ? t('common.openWebCamera') : null}
        </button>
      ) : null}
    </div>
  );
}
