import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  CalendarCheck2,
  ChevronRight,
  Heart,
  Navigation,
  Settings2,
  Share2,
} from 'lucide-react';

import { ClubAvatar } from '@/components/ClubAvatar';
import { ClubReviewsSection } from '@/components/ClubReviewsSection';
import { ShareModal } from '@/components/ShareModal';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { GamesByDateList } from '@/components/home/GamesByDateList';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { ClubCourtsGrid } from '@/components/clubPage/ClubCourtsGrid';
import { ClubHeroGallery } from '@/components/clubPage/ClubHeroGallery';
import { ClubPageInfoSection } from '@/components/clubPage/ClubPageInfoSection';
import { ClubPageSection } from '@/components/clubPage/ClubPageSection';
import { ClubRatingStars } from '@/components/clubPage/ClubRatingStars';
import { ClubRegularsRow } from '@/components/clubPage/ClubRegularsRow';
import { ClubTodayStrip } from '@/components/clubPage/ClubTodayStrip';
import { useClubPageScroll } from '@/components/clubPage/useClubPageScroll';
import { favoritesApi } from '@/api/favorites';
import {
  useClubPageGamesQuery,
  useClubPageQuery,
  useClubPageRegularsQuery,
  useClubTodayAvailabilityQuery,
} from '@/queries/clubPage/useClubPageQueries';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getClubMapsSearchUrl } from '@/utils/clubMapsUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { rememberPostLoginPath } from '@/utils/postLoginRedirect';
import { getClubShareUrl } from '@/utils/shareUrl';
import type { PublicClub } from '@/api/clubPublic';

const MAX_UPCOMING_GAMES = 10;

function ClubPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className={`h-64 w-full rounded-none ${shimmerBlock}`} aria-hidden />
      <div className="space-y-4 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-28 w-full rounded-2xl ${shimmerBlock}`} aria-hidden />
        ))}
      </div>
    </div>
  );
}

/**
 * PRD 354 — public club page (`/clubs/:id`, place `club`), hosted by `MainPage`.
 *
 * Guest-readable: it is not wrapped in `ProtectedRoute` and it is on the
 * offline-gate exception list in `App.tsx`. Everything renders for a signed-out
 * reader; the four actions that need an account (favourite, create, book, write
 * a review) remember this path and send the reader to sign in.
 *
 * The club payload comes from `/clubs/:id/public`, never `clubsApi.getById` —
 * that endpoint returns the raw row including `integrationConfig`.
 */
export const ClubPage = () => {
  const { t } = useTranslation();
  const { id: clubId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reducedMotion = usePrefersReducedMotion();

  const viewer = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const viewerId = viewer?.id;

  const clubQuery = useClubPageQuery(clubId);
  const club = clubQuery.data;

  const gamesQuery = useClubPageGamesQuery(clubId);
  const regularsQuery = useClubPageRegularsQuery(clubId);
  const todayQuery = useClubTodayAvailabilityQuery(clubId, Boolean(club?.booking.available));

  const { progress, parallaxOffset } = useClubPageScroll(reducedMotion);
  const [shareOpen, setShareOpen] = useState(false);
  const [favoriteOverride, setFavoriteOverride] = useState<boolean | null>(null);
  const [favoriteBouncing, setFavoriteBouncing] = useState(false);

  // Navigating club → club reuses this component, so the optimistic favourite
  // from the previous club must not survive into the next one.
  useEffect(() => {
    setFavoriteOverride(null);
  }, [clubId]);

  const isFavorite = favoriteOverride ?? club?.isFavorite ?? false;

  const requireAccount = useCallback(() => {
    rememberPostLoginPath(`${window.location.pathname}${window.location.search}`);
    navigate('/login');
  }, [navigate]);

  const handleToggleFavorite = useCallback(async () => {
    if (!club) return;
    if (!isAuthenticated) {
      requireAccount();
      return;
    }
    const next = !isFavorite;
    setFavoriteOverride(next);
    setFavoriteBouncing(true);
    window.setTimeout(() => setFavoriteBouncing(false), 200);
    try {
      if (next) await favoritesApi.addToFavorites(club.id);
      else await favoritesApi.removeFromFavorites(club.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.clubPage.club(club.id, viewerId) });
    } catch {
      setFavoriteOverride(!next);
      toast.error(t('clubPage.favoriteFailed'));
    }
  }, [club, isAuthenticated, isFavorite, queryClient, requireAccount, t, viewerId]);

  const goToCreateGame = useCallback(
    (params: { courtId?: string; date?: string } = {}) => {
      if (!club) return;
      if (!isAuthenticated) {
        requireAccount();
        return;
      }
      const search = new URLSearchParams({ clubId: club.id, entityType: 'GAME' });
      if (params.courtId) search.set('courtId', params.courtId);
      if (params.date) search.set('date', params.date);
      navigate(`/create-game?${search.toString()}`);
    },
    [club, isAuthenticated, navigate, requireAccount],
  );

  const handleDirections = useCallback(() => {
    if (!club) return;
    const url = getClubMapsSearchUrl({
      address: club.address,
      latitude: club.latitude,
      longitude: club.longitude,
    });
    if (url) void openExternalUrl(url);
  }, [club]);

  const heroPhotos = useMemo(() => {
    if (!club) return [];
    return club.carouselPhotos.length > 0 ? club.carouselPhotos : club.photos;
  }, [club]);

  const games = useMemo(
    () => (gamesQuery.data?.games ?? []).slice(0, MAX_UPCOMING_GAMES),
    [gamesQuery.data?.games],
  );

  if (clubQuery.isLoading && !club) {
    return <ClubPageSkeleton />;
  }

  // A dropped connection is not a missing club. Telling a guest opening a
  // shared link that "this club isn't available" — and offering them *other*
  // clubs — is the wrong answer to a failed request (CONTRACT §13).
  if (clubQuery.isError && !club) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyStateCard
          icon={Building2}
          title={t('clubPage.error.title')}
          description={t('clubPage.error.description')}
          action={
            <button
              type="button"
              onClick={() => void clubQuery.refetch()}
              disabled={clubQuery.isFetching}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {t('common.retry')}
            </button>
          }
        />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyStateCard
          icon={Building2}
          title={t('clubPage.notFound.title')}
          description={t('clubPage.notFound.description')}
          action={
            <button
              type="button"
              onClick={() => navigate('/find')}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"
            >
              {t('clubPage.notFound.browse')}
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <ClubPageStickyHeader
        club={club}
        progress={progress}
        isFavorite={isFavorite}
        onBack={() => navigate(-1)}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* `-mx-2` cancels MainPage's gutter so the first photo is truly full-bleed. */}
      <header className="relative -mx-2 h-64 overflow-hidden">
        <ClubHeroGallery
          photos={heroPhotos}
          clubName={club.name}
          parallaxOffset={parallaxOffset}
          reducedMotion={reducedMotion}
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <HeroIconButton label={t('common.back')} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} aria-hidden />
          </HeroIconButton>
          <div className="flex items-center gap-1">
            <HeroIconButton label={t('clubPage.share')} onClick={() => setShareOpen(true)}>
              <Share2 size={20} aria-hidden />
            </HeroIconButton>
            <HeroIconButton
              label={isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
              pressed={isFavorite}
              onClick={() => void handleToggleFavorite()}
            >
              <motion.span
                animate={reducedMotion || !favoriteBouncing ? { scale: 1 } : { scale: [1, 1.25, 1] }}
                transition={{ duration: 0.2 }}
                className="flex"
              >
                <Heart
                  size={20}
                  className={isFavorite ? 'fill-rose-500 text-rose-500' : ''}
                  aria-hidden
                />
              </motion.span>
            </HeroIconButton>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <span className="block h-16 w-16 shrink-0 translate-y-3 overflow-hidden rounded-2xl ring-4 ring-white dark:ring-gray-900">
            <ClubAvatar club={club} className="h-full w-full" />
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-xl font-bold text-white drop-shadow">{club.name}</h1>
            <ClubRatingStars
              rating={club.clubRating}
              reviewCount={club.clubReviewCount}
              premium={Boolean(viewer?.isPremium)}
              onColor
            />
          </div>
          {club.sports.length > 0 ? (
            <ul className="flex shrink-0 items-center gap-1 pb-1">
              {club.sports.map((sport) => (
                <li key={sport} className="flex">
                  <SportPublicIcon sport={sport} className="h-4 w-4 text-white/90" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div className="space-y-6 px-2 pt-6">
        <ClubActionRow
          club={club}
          onCreate={() => goToCreateGame()}
          onBook={() => goToCreateGame()}
          onDirections={handleDirections}
          onManage={() => navigate('/my-clubs')}
        />

        {club.booking.available && todayQuery.data ? (
          <ClubPageSection title={t('clubPage.today.title')}>
            <ClubTodayStrip
              availability={todayQuery.data}
              onSelectCourt={(courtId, date) => goToCreateGame({ courtId, date })}
            />
          </ClubPageSection>
        ) : null}

        <ClubPageSection
          title={t('clubPage.games.title')}
          action={
            games.length > 0 ? (
              <button
                type="button"
                onClick={() => navigate(`/find?clubIds=${encodeURIComponent(club.id)}`)}
                className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400"
              >
                {t('clubPage.games.seeAll')}
                <ChevronRight size={16} className="rtl:rotate-180" aria-hidden />
              </button>
            ) : undefined
          }
        >
          {gamesQuery.isLoading ? (
            <div className={`h-28 w-full rounded-2xl ${shimmerBlock}`} aria-hidden />
          ) : games.length > 0 ? (
            <GamesByDateList games={games} user={viewer} />
          ) : (
            <EmptyStateCard
              icon={CalendarPlus}
              title={t('clubPage.games.emptyTitle')}
              description={t('clubPage.games.emptyDescription')}
              action={
                <button
                  type="button"
                  onClick={() => goToCreateGame()}
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  {t('clubPage.actions.create')}
                </button>
              }
            />
          )}
        </ClubPageSection>

        {club.courts.length > 0 ? (
          <ClubPageSection title={t('clubPage.courts.title')}>
            <ClubCourtsGrid courts={club.courts} />
          </ClubPageSection>
        ) : null}

        <ClubPageSection title={t('clubPage.info.title')}>
          <ClubPageInfoSection club={club} />
        </ClubPageSection>

        {(regularsQuery.data?.length ?? 0) > 0 ? (
          <ClubPageSection title={t('clubPage.regulars.title')}>
            <ClubRegularsRow regulars={regularsQuery.data ?? []} />
          </ClubPageSection>
        ) : null}

        {/* Reviews read freely (the endpoint is optionalAuth); only writing one
            asks the guest to sign in, per PRD 354 "Guest behavior". */}
        <ClubPageSection title={t('clubPage.reviews.title')}>
          <div className="space-y-3">
            <ClubReviewsSection
              clubId={club.id}
              initialSummary={{ rating: club.clubRating, reviewCount: club.clubReviewCount }}
              onOpenPhoto={(url) => void openExternalUrl(url)}
            />
            {!isAuthenticated ? (
              <EmptyStateCard
                icon={CalendarCheck2}
                title={t('clubPage.reviews.guestTitle')}
                description={t('clubPage.reviews.guestDescription')}
                action={
                  <button
                    type="button"
                    onClick={requireAccount}
                    className="inline-flex min-h-[44px] items-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    {t('clubPage.signIn')}
                  </button>
                }
              />
            ) : null}
          </div>
        </ClubPageSection>
      </div>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={getClubShareUrl(club.id)}
        dialogTitle={t('clubPage.shareTitle')}
        modalId="share-modal-club-page"
      />
    </div>
  );
};

function HeroIconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform duration-200 hover:bg-black/50 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${pressScaleGuard}`}
    >
      {children}
    </button>
  );
}

/**
 * The hero collapses into this bar rather than cross-fading two headers: it is
 * always mounted and its opacity is driven by scroll progress, so there is only
 * ever one animated hero element.
 */
function ClubPageStickyHeader({
  club,
  progress,
  isFavorite,
  onBack,
  onToggleFavorite,
}: {
  club: PublicClub;
  progress: number;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const visible = progress > 0.6;

  return (
    <div
      data-testid="club-page-sticky-header"
      aria-hidden={!visible}
      style={{ opacity: visible ? 1 : 0 }}
      className={`sticky top-0 z-30 -mx-2 flex items-center gap-2 border-b border-gray-200/80 bg-white/95 px-2 py-2 backdrop-blur transition-opacity duration-200 dark:border-gray-700/80 dark:bg-gray-900/95 ${
        visible ? '' : 'pointer-events-none'
      }`}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common.back')}
        tabIndex={visible ? 0 : -1}
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 dark:text-gray-200"
      >
        <ArrowLeft size={20} className="rtl:rotate-180" aria-hidden />
      </button>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
        {club.name}
      </p>
      <button
        type="button"
        onClick={() => void onToggleFavorite()}
        aria-label={isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
        aria-pressed={isFavorite}
        tabIndex={visible ? 0 : -1}
        className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 dark:text-gray-200"
      >
        <Heart size={20} className={isFavorite ? 'fill-rose-500 text-rose-500' : ''} aria-hidden />
      </button>
    </div>
  );
}

/**
 * **Book** deliberately routes into the create-game flow rather than opening a
 * connect sheet here.
 *
 * The connect sheet needs the club's `integrationConfig`, which this page must
 * never receive — the whole point of `/clubs/:id/public` is that the config
 * stays server-side. Create-game already owns both halves of the booking flow
 * (connected → provider slots, not connected → `ConnectClubSheet`) and it loads
 * the full club for an authenticated user, so this hands the player to the one
 * place that can safely tell the two apart.
 */
function ClubActionRow({
  club,
  onCreate,
  onBook,
  onDirections,
  onManage,
}: {
  club: PublicClub;
  onCreate: () => void;
  onBook: () => void;
  onDirections: () => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const showBook = club.booking.available;
  const showManage = club.isAdmin;
  // At 375 px, four equal columns are ≈84 px each and German
  // "Wegbeschreibung" renders as "Wegbe…" — the icons would be carrying the
  // meaning, which PRD 354's own accessibility line forbids. A club admin at a
  // bookable club gets a 2 × 2 grid on a phone instead, four across from `sm`.
  const actionCount = 2 + (showBook ? 1 : 0) + (showManage ? 1 : 0);

  return (
    <div
      className={`grid gap-2 ${
        actionCount >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'auto-cols-fr grid-flow-col'
      }`}
    >
      <ActionButton icon={CalendarPlus} label={t('clubPage.actions.create')} onClick={onCreate} primary />
      {showBook ? (
        <ActionButton
          icon={CalendarCheck2}
          label={t('clubPage.actions.book')}
          onClick={onBook}
          testId="club-page-book"
        />
      ) : null}
      <ActionButton icon={Navigation} label={t('clubPage.actions.directions')} onClick={onDirections} />
      {showManage ? (
        <ActionButton
          icon={Settings2}
          label={t('clubPage.actions.manage')}
          onClick={onManage}
          testId="club-page-manage"
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  testId,
}: {
  icon: typeof CalendarPlus;
  label: string;
  onClick: () => void;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition-colors ${
        primary
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
      }`}
    >
      <Icon size={18} aria-hidden />
      {/* Two lines rather than an ellipsis: a truncated label leaves only the
          icon carrying the action, which PRD 354 explicitly rules out. */}
      <span className="line-clamp-2 text-pretty leading-tight">{label}</span>
    </button>
  );
}
