import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Camera, ChevronDown, Loader2, Star, X } from 'lucide-react';
import { Button, PlayerAvatar } from '@/components';
import { clubsApi } from '@/api/clubs';
import type { ClubEligibleReviewGame } from '@/api/clubs';
import { mediaApi } from '@/api/media';
import type { ChatImageUploadResponse } from '@/api/media';
import type { ClubReview, ClubReviewSummary } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { normalizeClubPhotos } from '@/utils/clubPhotos';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 15;
const MAX_PHOTOS = 6;

function StarRow({ value, interactive, onPick, size = 22 }: { value: number; interactive?: boolean; onPick?: (n: number) => void; size?: number }) {
  if (!interactive) {
    return (
      <div className="flex items-center gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={size}
            className={`shrink-0 ${value >= s ? 'fill-amber-500 text-amber-500' : 'text-gray-200 dark:text-gray-600'}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick?.(s)}
          className="p-1 rounded-lg transition-all duration-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          aria-label={`${s}`}
        >
          <Star
            size={size}
            className={`transition-colors ${value >= s ? 'fill-amber-500 text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-amber-400/70'}`}
          />
        </button>
      ))}
    </div>
  );
}

type ClubReviewsSectionProps = {
  clubId: string;
  initialSummary?: ClubReviewSummary | null;
  onClubRefresh?: () => Promise<void>;
  onOpenPhoto: (url: string) => void;
};

export function ClubReviewsSection({ clubId, initialSummary, onClubRefresh, onOpenPhoto }: ClubReviewsSectionProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [summary, setSummary] = useState<ClubReviewSummary | null>(
    initialSummary ? { rating: initialSummary.rating, reviewCount: initialSummary.reviewCount } : null
  );
  const [reviews, setReviews] = useState<ClubReview[]>([]);
  const [total, setTotal] = useState(0);
  const lastLoadedPageRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [eligibleGames, setEligibleGames] = useState<ClubEligibleReviewGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [myReview, setMyReview] = useState<ClubReview | null | undefined>(undefined);
  const [myReviewLoadError, setMyReviewLoadError] = useState(false);
  const [myReviewRetryKey, setMyReviewRetryKey] = useState(0);
  const [loadingMyReview, setLoadingMyReview] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [draftPhotos, setDraftPhotos] = useState<ChatImageUploadResponse[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = useCallback(
    async (pageNum: number) => {
      const res = await clubsApi.getReviews(clubId, { page: pageNum, limit: PAGE_SIZE });
      const payload = res?.data;
      if (payload) {
        setSummary({ rating: payload.summary.rating, reviewCount: payload.summary.reviewCount });
        setReviews((prev) => (pageNum === 1 ? payload.reviews : [...prev, ...payload.reviews]));
        setTotal(payload.total);
        lastLoadedPageRef.current = pageNum;
      }
    },
    [clubId]
  );

  useEffect(() => {
    if (initialSummary) {
      setSummary({ rating: initialSummary.rating, reviewCount: initialSummary.reviewCount });
    }
  }, [initialSummary]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadReviews(1);
      } catch {
        if (!cancelled) toast.error(t('errors.generic'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, loadReviews, t]);

  useEffect(() => {
    if (!user?.id) {
      setEligibleGames([]);
      return;
    }
    let cancelled = false;
    setLoadingGames(true);
    clubsApi
      .getEligibleReviewGames(clubId)
      .then((res) => {
        if (cancelled) return;
        const list = res?.data ?? [];
        setEligibleGames(list);
        if (list.length === 1) setSelectedGameId(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setEligibleGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGames(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedGameId) {
      setMyReview(undefined);
      setMyReviewLoadError(false);
      return;
    }
    let cancelled = false;
    setMyReview(undefined);
    setMyReviewLoadError(false);
    setLoadingMyReview(true);
    clubsApi
      .getMyClubReview(clubId, selectedGameId)
      .then((res) => {
        if (cancelled) return;
        setMyReview(res.data ?? null);
        setMyReviewLoadError(false);
      })
      .catch(() => {
        if (!cancelled) {
          setMyReview(undefined);
          setMyReviewLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMyReview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, selectedGameId, user?.id, myReviewRetryKey]);

  useEffect(() => {
    if (myReview === undefined || loadingMyReview || !myReview) return;
    setReviewStars(myReview.stars);
    setReviewText(myReview.text?.trim() ?? '');
    setDraftPhotos(
      normalizeClubPhotos(myReview.photos as unknown).map((p) => ({
        originalUrl: p.originalUrl,
        thumbnailUrl: p.thumbnailUrl,
        originalSize: { width: 0, height: 0 },
        thumbnailSize: { width: 0, height: 0 },
      }))
    );
  }, [myReview, loadingMyReview]);

  const canCompose = Boolean(user && eligibleGames.length > 0);
  const showNewComposer = Boolean(
    selectedGameId && !loadingMyReview && !myReviewLoadError && myReview === null && canCompose
  );
  const showEditComposer = Boolean(editingReview && myReview);

  const gameLabel = useCallback(
    (g: ClubEligibleReviewGame) => {
      const when = formatDate(g.startTime, 'd MMM yyyy, HH:mm');
      const title = g.name?.trim() || t('club.reviews.gameFallback');
      return `${title} · ${when}`;
    },
    [t]
  );

  const handleSubmit = async () => {
    if (!selectedGameId) {
      toast.error(t('club.reviews.pickVisit'));
      return;
    }
    if (reviewStars < 1 || reviewStars > 5) {
      toast.error(t('training.selectStars', { defaultValue: 'Please select a rating (1-5 stars)' }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await clubsApi.submitClubReview(clubId, {
        gameId: selectedGameId,
        stars: reviewStars,
        text: reviewText.trim() || undefined,
        photos: draftPhotos.map((p) => ({ originalUrl: p.originalUrl, thumbnailUrl: p.thumbnailUrl })),
      });
      setMyReview(res.data!.review);
      setEditingReview(false);
      setSummary(res.data!.summary);
      await loadReviews(1);
      await onClubRefresh?.();
      toast.success(
        myReview != null
          ? t('training.reviewUpdated', { defaultValue: 'Review updated' })
          : t('training.reviewSubmitted', { defaultValue: 'Thank you for your review!' })
      );
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file || !selectedGameId) return;
    if (draftPhotos.length >= MAX_PHOTOS) {
      toast.error(t('club.reviews.maxPhotos', { count: MAX_PHOTOS }));
      return;
    }
    setUploadingPhoto(true);
    try {
      const data = await mediaApi.uploadClubReviewPhoto(clubId, selectedGameId, file);
      setDraftPhotos((p) => [...p, data]);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const loadMore = async () => {
    if (loadMoreLockRef.current || loadingMore || reviews.length >= total) return;
    const nextPage = lastLoadedPageRef.current + 1;
    if (nextPage > Math.max(1, Math.ceil(total / PAGE_SIZE))) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    try {
      await loadReviews(nextPage);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
    }
  };

  const count = summary?.reviewCount ?? 0;
  const rating = summary?.rating;

  return (
    <section className="rounded-2xl border border-gray-200/90 dark:border-gray-700/90 bg-gradient-to-b from-white to-gray-50/80 dark:from-gray-900 dark:to-gray-900/80 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">{t('club.reviews.title')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('club.reviews.subtitle')}</p>
          </div>
          {count > 0 && rating != null ? (
            <div className="flex flex-col items-end shrink-0">
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Star size={18} className="fill-current shrink-0" />
                <span className="text-xl font-bold tabular-nums leading-none">{rating.toFixed(1)}</span>
              </div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {t('club.reviews.basedOn', { count })}
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 shrink-0">{t('club.reviews.noneYet')}</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {user && (loadingGames || eligibleGames.length > 0) ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40 p-3 space-y-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">{t('club.reviews.visitLabel')}</label>
            <div className="relative">
              <select
                value={selectedGameId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedGameId(v);
                  setEditingReview(false);
                  setMyReview(undefined);
                  setMyReviewLoadError(false);
                  setReviewStars(0);
                  setReviewText('');
                  setDraftPhotos([]);
                }}
                disabled={loadingGames || eligibleGames.length === 0}
                className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/90 text-sm text-gray-900 dark:text-white pl-3 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500/35 disabled:opacity-60"
              >
                <option value="">{loadingGames ? t('common.loading') : t('club.reviews.pickVisit')}</option>
                {eligibleGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {gameLabel(g)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                aria-hidden
              />
            </div>

            {selectedGameId ? (
              loadingMyReview ? (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-2 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  {t('common.loading')}
                </div>
              ) : myReviewLoadError ? (
                <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 px-3 py-3 flex flex-col gap-2">
                  <p className="text-xs text-red-800 dark:text-red-200">{t('club.reviews.loadMyReviewFailed')}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start text-red-700 dark:text-red-300"
                    onClick={() => setMyReviewRetryKey((k) => k + 1)}
                  >
                    {t('club.reviews.retry')}
                  </Button>
                </div>
              ) : myReview != null && !editingReview ? (
                <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <Star size={16} className="fill-amber-500 text-amber-500" />
                    <span className="text-sm font-medium">{t('club.reviews.youRated', { count: myReview.stars })}</span>
                  </div>
                  {myReview.text?.trim() ? (
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{myReview.text.trim()}</p>
                  ) : null}
                  {normalizeClubPhotos(myReview.photos as unknown).length > 0 ? (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {normalizeClubPhotos(myReview.photos as unknown).map((ph) => (
                        <button
                          key={ph.originalUrl}
                          type="button"
                          onClick={() => onOpenPhoto(ph.originalUrl)}
                          className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-amber-200/80 dark:border-amber-800/50"
                        >
                          <img src={ph.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingReview(true)}
                    className="self-start -ml-1 text-primary-600 dark:text-primary-400"
                  >
                    {t('training.editReview', { defaultValue: 'Edit review' })}
                  </Button>
                </div>
              ) : showNewComposer || showEditComposer ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('club.reviews.rateLabel')}</p>
                    <StarRow value={reviewStars} interactive onPick={setReviewStars} size={28} />
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value.slice(0, 1000))}
                    placeholder={t('club.reviews.commentPlaceholder')}
                    rows={3}
                    maxLength={1000}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 text-sm text-gray-900 dark:text-white px-3 py-2.5 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/35 resize-none min-h-[88px]"
                  />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('club.reviews.photosHint', { max: MAX_PHOTOS })}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {draftPhotos.map((ph) => (
                        <div key={ph.originalUrl} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 group">
                          <button type="button" onClick={() => onOpenPhoto(ph.originalUrl)} className="block w-full h-full">
                            <img src={ph.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraftPhotos((prev) => prev.filter((x) => x.originalUrl !== ph.originalUrl))}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label={t('club.reviews.removePhoto')}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {draftPhotos.length < MAX_PHOTOS ? (
                        <label className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-primary-400 hover:text-primary-500 cursor-pointer transition-colors">
                          {uploadingPhoto ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            disabled={uploadingPhoto}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              void onPickPhoto(f ?? null);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {editingReview && myReview != null ? (
                      <Button type="button" variant="ghost" size="md" className="flex-1 rounded-xl" onClick={() => setEditingReview(false)}>
                        {t('common.cancel')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={submitting}
                      className="flex-1 rounded-xl min-h-[44px] inline-flex items-center justify-center gap-2"
                      onClick={() => void handleSubmit()}
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                      {myReview != null ? t('training.updateReview', { defaultValue: 'Save' }) : t('club.reviews.submit')}
                    </Button>
                  </div>
                </div>
              ) : null
            ) : null}
          </div>
        ) : user && !loadingGames && eligibleGames.length === 0 ? (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400 px-2 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-700">
            {t('club.reviews.noEligibleGames')}
          </p>
        ) : null}

        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('club.reviews.community')}</h4>
          {loading ? (
            <div className="flex justify-center py-8 text-gray-500">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">{t('club.reviews.emptyList')}</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => {
                const rPhotos = normalizeClubPhotos(r.photos as unknown);
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-800/30 p-3 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <PlayerAvatar player={r.reviewer} extrasmall showName={false} fullHideName />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {[r.reviewer?.firstName, r.reviewer?.lastName].filter(Boolean).join(' ').trim() ||
                              t('common.unknown')}
                          </span>
                          <span className="text-[11px] text-gray-400">{formatDate(r.createdAt, 'd MMM yyyy')}</span>
                        </div>
                        <StarRow value={r.stars} size={16} />
                        {r.text?.trim() ? (
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug whitespace-pre-wrap break-words">{r.text.trim()}</p>
                        ) : null}
                        {rPhotos.length > 0 ? (
                          <div className="flex gap-1.5 overflow-x-auto pt-1">
                            {rPhotos.map((ph) => (
                              <button
                                key={ph.originalUrl}
                                type="button"
                                onClick={() => onOpenPhoto(ph.originalUrl)}
                                className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600"
                              >
                                <img src={ph.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && reviews.length < total ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('club.reviews.loadMore')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
