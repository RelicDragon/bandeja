import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, ExternalLink, Globe, Link2, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import type { Club } from '@/types';
import { ClubAvatar } from '@/components/ClubAvatar';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { getTelUrl } from '@/utils/telUrl';
import { normalizeClubPhotos } from '@/utils/clubPhotos';
import { ClubReviewsSection } from '@/components/ClubReviewsSection';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { CourtLocationLinks } from '@/components/CourtLocationLinks';
import { getClubMapsSearchUrl } from '@/utils/clubMapsUrl';
import { websiteDisplayHost } from '@/utils/websiteHostname';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { useAuthStore } from '@/store/authStore';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeReconnectPrompt } from '@/hooks/useBooktimeReconnectPrompt';
import {
  ConnectClubSheet,
  type BooktimeIntegrationConfig,
} from '@/components/booktime/ConnectClubSheet';
import { hydrateBooktimeSession } from '@/integrations/booktime/session';
import { useBooktimeSnapshotRefresh } from '@/hooks/useBooktimeSnapshotRefresh';
import { BooktimeAvailabilityBanner } from '@/components/booktime/BooktimeAvailabilityBanner';
import { AvailabilitySheet } from '@/components/booktime/AvailabilitySheet';
import { BooktimeUpcomingBookings } from '@/components/booktime/BooktimeUpcomingBookings';

const ClubMiniMap = lazy(async () => {
  const m = await import('@/components/ClubMiniMap');
  return { default: m.ClubMiniMap };
});

type ClubDetailPanelProps = {
  club: Club;
  onOpenFullscreenPhoto: (url: string) => void;
  onClubRefresh?: () => Promise<void>;
  snapshotDate?: Date;
};

function parseBooktimeConfig(raw: unknown): BooktimeIntegrationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const companyId = (raw as Record<string, unknown>).companyId;
  if (typeof companyId !== 'string' || !companyId.trim()) return null;
  const config: BooktimeIntegrationConfig = { companyId: companyId.trim() };
  const termsUrl = (raw as Record<string, unknown>).termsUrl;
  const privacyUrl = (raw as Record<string, unknown>).privacyUrl;
  if (typeof termsUrl === 'string' && termsUrl.trim()) config.termsUrl = termsUrl.trim();
  if (typeof privacyUrl === 'string' && privacyUrl.trim()) config.privacyUrl = privacyUrl.trim();
  return config;
}

function amenityEntries(amenities: Record<string, unknown> | undefined | null): { key: string; label: string }[] {
  if (!amenities || typeof amenities !== 'object') return [];
  const out: { key: string; label: string }[] = [];
  for (const [k, v] of Object.entries(amenities)) {
    if (v === true) out.push({ key: k, label: k });
    else if (typeof v === 'string' && v.trim()) out.push({ key: k, label: `${k}: ${v.trim()}` });
  }
  return out;
}

export function ClubDetailPanel({ club, onOpenFullscreenPhoto, onClubRefresh, snapshotDate }: ClubDetailPanelProps) {
  const { t } = useTranslation();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBooktimeClub = club.integrationType === 'BOOKTIME';
  const booktimeConfig = useMemo(
    () => (isBooktimeClub ? parseBooktimeConfig(club.integrationConfig) : null),
    [club.integrationConfig, isBooktimeClub]
  );
  const { status: booktimeAuth, loading: booktimeAuthLoading, refresh: refreshBooktimeAuth } = useBooktimeClubAuth(
    club.id,
    isAuthenticated && isBooktimeClub
  );
  const { reconnectRequired, clearReconnectRequired } = useBooktimeReconnectPrompt(
    club.id,
    isAuthenticated && isBooktimeClub
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState(() => snapshotDate ?? new Date());
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);
  const scheduleDate = useMemo(
    () => (snapshotDate != null ? snapshotDate : availabilityDate),
    [availabilityDate, snapshotDate]
  );
  const {
    refreshSnapshot,
    isRefreshingSnapshot,
    snapshotBanner,
    lastFetchedAt,
  } = useBooktimeSnapshotRefresh(
    club,
    scheduleDate,
    isAuthenticated && isBooktimeClub
  );

  useEffect(() => {
    if (snapshotDate) setAvailabilityDate(snapshotDate);
  }, [snapshotDate]);

  useEffect(() => {
    if (!isAuthenticated || !isBooktimeClub) return;
    void refreshSnapshot();
  }, [isAuthenticated, isBooktimeClub, refreshSnapshot, scheduleDate]);

  const photos = useMemo(() => normalizeClubPhotos(club.carouselPhotos ?? club.photos), [club.carouselPhotos, club.photos]);
  const courts = useMemo(
    () => [...(club.courts ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [club.courts]
  );
  const cityLine =
    club.city?.name && club.city?.country
      ? `${translateCity(club.city.id, club.city.name, club.city.country)}, ${translateCountry(club.city.country)}`
      : club.city?.name
        ? translateCity(club.city.id, club.city.name, club.city.country ?? '')
        : '';
  const mapsUrl = getClubMapsSearchUrl({
    address: club.address,
    latitude: club.latitude,
    longitude: club.longitude,
  });
  const hasCoords =
    club.latitude != null &&
    club.longitude != null &&
    Number.isFinite(club.latitude) &&
    Number.isFinite(club.longitude);
  const telHref = club.phone?.trim() ? getTelUrl(club.phone.trim()) : null;
  const website = club.website?.trim();
  const email = club.email?.trim();
  const hoursParts = [club.openingTime?.trim(), club.closingTime?.trim()].filter(Boolean);
  const hoursLine = hoursParts.length ? hoursParts.join(' · ') : '';
  const amenities = amenityEntries(club.amenities as Record<string, unknown> | null | undefined);
  const hasLocationBody = !!(club.address?.trim() || cityLine || mapsUrl || hasCoords);
  const contactBlock = !!(telHref || website || email);
  const showBooktimeConnect =
    isBooktimeClub &&
    isAuthenticated &&
    booktimeConfig &&
    !booktimeAuthLoading &&
    (!booktimeAuth?.connected || reconnectRequired);

  useEffect(() => {
    if (reconnectRequired && booktimeConfig) {
      setConnectOpen(true);
    }
  }, [reconnectRequired, booktimeConfig]);

  const handleConnected = async () => {
    clearReconnectRequired();
    if (booktimeConfig) {
      await hydrateBooktimeSession(club.id, booktimeConfig.companyId);
    }
    await refreshBooktimeAuth();
    await onClubRefresh?.();
  };

  return (
    <div className="space-y-4 text-gray-900 dark:text-white">
      <div className="flex justify-center">
        <ClubAvatar
          club={club}
          className="h-28 w-[10.5rem] sm:h-32 sm:w-48"
          fallbackLetterClassName="text-4xl sm:text-5xl font-bold"
        />
      </div>

      {showBooktimeConnect ? (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800/60 bg-primary-50/80 dark:bg-primary-950/30 p-3">
          <div className="flex items-start gap-3">
            <Link2 size={18} className="text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('club.booktime.connectBannerTitle')}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{t('club.booktime.connectBannerHint')}</p>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {t('club.booktime.connectCta')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isBooktimeClub && isAuthenticated ? (
        <BooktimeAvailabilityBanner loading={isRefreshingSnapshot} banner={snapshotBanner} />
      ) : null}

      {isBooktimeClub && booktimeConfig && isAuthenticated ? (
        <AvailabilitySheet
          club={club}
          companyId={booktimeConfig.companyId}
          selectedDate={scheduleDate}
          onDateChange={setAvailabilityDate}
          lastFetchedAt={lastFetchedAt}
          connected={!!booktimeAuth?.connected}
          onConnectRequest={() => setConnectOpen(true)}
          onRefreshSnapshot={refreshSnapshot}
          onBooked={() => setBookingsRefreshKey((k) => k + 1)}
          enabled
        />
      ) : null}

      {isBooktimeClub && booktimeConfig && isAuthenticated && booktimeAuth?.connected ? (
        <BooktimeUpcomingBookings
          club={club}
          companyId={booktimeConfig.companyId}
          connected
          enabled
          onRefreshSnapshot={refreshSnapshot}
          refreshKey={bookingsRefreshKey}
        />
      ) : null}

      {isBooktimeClub && booktimeAuth?.connected ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {t('club.booktime.connectedAs', { phone: booktimeAuth.phoneNumber ?? '—' })}
        </div>
      ) : null}

      {booktimeAuthLoading && isBooktimeClub && isAuthenticated ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          {t('common.loading')}
        </div>
      ) : null}

      {booktimeConfig ? (
        <ConnectClubSheet
          club={club}
          integrationConfig={booktimeConfig}
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={handleConnected}
        />
      ) : null}

      {contactBlock ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 p-3 space-y-2">
          {telHref ? (
            <a
              href={telHref}
              className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline min-w-0"
            >
              <Phone size={16} className="shrink-0" />
              <span className="truncate">{club.phone?.trim()}</span>
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline min-w-0">
              <Mail size={16} className="shrink-0" />
              <span className="truncate">{email}</span>
            </a>
          ) : null}
          {website ? (
            <button
              type="button"
              onClick={() => openExternalUrl(website)}
              className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline min-w-0 text-left w-full"
            >
              <Globe size={16} className="shrink-0" />
              <span className="truncate">{websiteDisplayHost(website)}</span>
              <ExternalLink size={14} className="shrink-0 opacity-70" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {hasLocationBody ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-3 space-y-3">
          <div className="flex gap-2 min-w-0">
            <MapPin size={18} className="text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              {club.address?.trim() ? (
                <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{club.address.trim()}</p>
              ) : null}
              {cityLine ? (
                <p className="text-gray-600 dark:text-gray-400 truncate">{cityLine}</p>
              ) : null}
            </div>
          </div>
          {hasCoords ? (
            <Suspense
              fallback={
                <div className="h-44 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
              }
            >
              <ClubMiniMap latitude={club.latitude!} longitude={club.longitude!} />
            </Suspense>
          ) : null}
          {mapsUrl ? (
            <button
              type="button"
              onClick={() => openExternalUrl(mapsUrl)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-100 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <MapPin size={16} className="shrink-0" />
              {t('club.openInMaps')}
            </button>
          ) : null}
        </div>
      ) : null}

      {hoursLine ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            <Clock size={14} />
            {t('club.hoursTitle')}
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-100">{hoursLine}</p>
        </div>
      ) : null}

      {courts.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('club.courtsTitle')}</p>
          <ul className="space-y-2">
            {courts.map((court) => (
              <li
                key={court.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm flex flex-wrap items-baseline justify-between gap-2"
              >
                <CourtDisplayName
                  name={court.name}
                  integrationName={court.integrationCourtName}
                  primaryClassName="font-medium text-gray-900 dark:text-white"
                  secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span>
                    {court.isIndoor ? t('club.indoor') : t('club.outdoor')}
                    {court.courtType ? ` · ${court.courtType}` : ''}
                    {court.pricePerHour != null && Number.isFinite(Number(court.pricePerHour))
                      ? ` · ${t('club.perHour', { price: court.pricePerHour })}`
                      : ''}
                  </span>
                  {court.webCameraUrl?.trim() ? (
                    <CourtLocationLinks
                      court={court}
                      className="inline-flex"
                      linkClassName="inline-flex items-center text-primary-600 dark:text-primary-400 hover:opacity-80"
                      iconSize={14}
                      showWebCameraLabel={false}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ClubReviewsSection
        clubId={club.id}
        initialSummary={{ rating: club.clubRating ?? null, reviewCount: club.clubReviewCount ?? 0 }}
        onClubRefresh={onClubRefresh}
        onOpenPhoto={onOpenFullscreenPhoto}
      />

      {amenities.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('club.amenitiesTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <span
                key={a.key}
                className="inline-flex px-2 py-0.5 rounded-md text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
              >
                {a.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {club.description?.trim() ? (
        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{club.description.trim()}</p>
      ) : null}

      {photos.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('createGame.clubPhotos')}</p>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
            {photos.map((ph) => (
              <button
                key={ph.originalUrl}
                type="button"
                onClick={() => onOpenFullscreenPhoto(ph.originalUrl)}
                className="snap-start shrink-0 w-28 h-28 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <img src={ph.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
