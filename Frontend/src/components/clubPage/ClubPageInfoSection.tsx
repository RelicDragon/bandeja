import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Clock, Globe, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import type { PublicClub } from '@/api/clubPublic';
import { amenityEntries } from '@/components/clubAmenities';
import { getClubMapsSearchUrl } from '@/utils/clubMapsUrl';
import { getTelUrl } from '@/utils/telUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { websiteDisplayHost } from '@/utils/websiteHostname';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const ClubMiniMap = lazy(async () => {
  const m = await import('@/components/ClubMiniMap');
  return { default: m.ClubMiniMap };
});

type ClubPageInfoSectionProps = {
  club: PublicClub;
};

const ROW_CLASS =
  'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-200 dark:hover:bg-gray-800';

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      aria-hidden
    >
      {children}
    </span>
  );
}

/**
 * PRD 354 — the Info block: address + mini map, opening hours, contact rows,
 * amenity chips, and the cancellation policy behind a disclosure.
 *
 * The schema stores only flat `openingTime` / `closingTime` strings, so this
 * renders a single honest "open today" line rather than inventing a per-weekday
 * schedule the database does not have.
 */
export function ClubPageInfoSection({ club }: ClubPageInfoSectionProps) {
  const { t } = useTranslation();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const reducedMotion = usePrefersReducedMotion();
  const [policyOpen, setPolicyOpen] = useState(false);

  const amenities = amenityEntries(club.amenities);
  // Locals rather than `club.x?.trim()` inline: optional chaining does not
  // narrow the field itself, so the helpers below would still see `| null`.
  const phone = club.phone?.trim() || null;
  const website = club.website?.trim() || null;
  const email = club.email?.trim() || null;
  const description = club.description?.trim() || null;
  const policyText = club.policyText?.trim() || null;
  const mapsUrl = getClubMapsSearchUrl({
    address: club.address,
    latitude: club.latitude,
    longitude: club.longitude,
  });
  const hasCoordinates = club.latitude != null && club.longitude != null;
  const cityLine = [
    translateCity(club.city.id, club.city.name, club.city.country),
    translateCountry(club.city.country),
  ]
    .filter(Boolean)
    .join(', ');
  const hours =
    club.openingTime && club.closingTime
      ? t('clubPage.info.hoursRange', { open: club.openingTime, close: club.closingTime })
      : null;

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200/90 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      {hasCoordinates ? (
        <Suspense
          fallback={
            <div className="flex h-44 w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
              <span className="sr-only">{t('common.loading')}</span>
            </div>
          }
        >
          <ClubMiniMap latitude={club.latitude as number} longitude={club.longitude as number} />
        </Suspense>
      ) : null}

      {mapsUrl ? (
        <button type="button" onClick={() => void openExternalUrl(mapsUrl)} className={ROW_CLASS}>
          <IconChip>
            <MapPin size={18} />
          </IconChip>
          <span className="flex-1">
            <span className="block font-medium">{club.address}</span>
            {cityLine ? (
              <span className="block text-xs text-gray-500 dark:text-gray-400">{cityLine}</span>
            ) : null}
          </span>
        </button>
      ) : (
        <p className={`${ROW_CLASS} pointer-events-none`}>
          <IconChip>
            <MapPin size={18} />
          </IconChip>
          <span className="flex-1 font-medium">{club.address}</span>
        </p>
      )}

      {hours ? (
        <p className={`${ROW_CLASS} pointer-events-none`}>
          <IconChip>
            <Clock size={18} />
          </IconChip>
          <span className="flex-1">
            <span className="block font-medium">{hours}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {t('clubPage.info.hoursEveryDay')}
            </span>
          </span>
        </p>
      ) : null}

      {phone ? (
        <a href={getTelUrl(phone)} className={ROW_CLASS}>
          <IconChip>
            <Phone size={18} />
          </IconChip>
          <span className="flex-1 font-medium">{phone}</span>
        </a>
      ) : null}

      {website ? (
        <button type="button" onClick={() => void openExternalUrl(website)} className={ROW_CLASS}>
          <IconChip>
            <Globe size={18} />
          </IconChip>
          <span className="flex-1 truncate font-medium">{websiteDisplayHost(website)}</span>
        </button>
      ) : null}

      {email ? (
        <a href={`mailto:${email}`} className={ROW_CLASS}>
          <IconChip>
            <Mail size={18} />
          </IconChip>
          <span className="flex-1 truncate font-medium">{email}</span>
        </a>
      ) : null}

      {description ? (
        <p className="whitespace-pre-wrap px-2 text-sm text-gray-700 dark:text-gray-200">
          {description}
        </p>
      ) : null}

      {amenities.length > 0 ? (
        <div className="px-2">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            {t('club.amenitiesTitle')}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {amenities.map((amenity) => (
              <li
                key={amenity.key}
                className="inline-flex rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {amenity.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {policyText || club.cancellationNoticeHours != null ? (
        <div className="px-2">
          <button
            type="button"
            onClick={() => setPolicyOpen((open) => !open)}
            aria-expanded={policyOpen}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 text-start text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-200"
          >
            {t('clubPage.info.cancellationPolicy')}
            <ChevronDown
              size={16}
              className={`shrink-0 text-gray-400 ${reducedMotion ? '' : 'transition-transform duration-200'} ${
                policyOpen ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>
          {policyOpen ? (
            <div className="space-y-1 pb-2 text-sm text-gray-600 dark:text-gray-300">
              {club.cancellationNoticeHours != null ? (
                <p>{t('clubPage.info.cancellationNotice', { count: club.cancellationNoticeHours })}</p>
              ) : null}
              {policyText ? <p className="whitespace-pre-wrap">{policyText}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
