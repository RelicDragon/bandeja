import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import { Card, Loading, PlayerAvatar, Button } from '@/components';
import { trainersApi } from '@/api/trainers';
import { formatDate } from '@/utils/dateFormat';
import type { TrainerReview, TrainerReviewSummary } from '@/types';

const REVIEWS_PAGE_SIZE = 20;

export interface ReviewsListProps {
  trainerId: string;
  initialSummary?: TrainerReviewSummary | { rating: number | null; reviewCount: number } | null;
  onReviewClick?: (gameId: string) => void;
  showSummary?: boolean;
  summaryTitleKey?: string;
  showTitle?: boolean;
  titleKey?: string;
  compact?: boolean;
}

export const ReviewsList = ({
  trainerId,
  initialSummary = null,
  onReviewClick,
  showSummary = true,
  summaryTitleKey,
  showTitle = true,
  titleKey = 'profile.allReviews',
  compact = false,
}: ReviewsListProps) => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<{ rating: number | null; reviewCount: number } | null>(
    initialSummary ? { rating: initialSummary.rating, reviewCount: initialSummary.reviewCount } : null
  );
  const [reviews, setReviews] = useState<TrainerReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async (pageNum: number) => {
    const res = await trainersApi.getReviews(trainerId, { page: pageNum, limit: REVIEWS_PAGE_SIZE });
    const payload = res?.data;
    if (payload) {
      setSummary(payload.summary ? { rating: payload.summary.rating, reviewCount: payload.summary.reviewCount } : null);
      setReviews((prev) => (pageNum === 1 ? (payload.reviews ?? []) : [...prev, ...(payload.reviews ?? [])]));
      setTotal(payload.total ?? 0);
      setPage(pageNum);
    }
  }, [trainerId]);

  useEffect(() => {
    if (!trainerId) return;
    const run = async () => {
      try {
        setLoading(true);
        setError(false);
        await load(1);
      } catch (e) {
        console.error('Failed to load trainer reviews:', e);
        setError(true);
        toast.error(t('errors.generic') || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [trainerId, load, t]);

  const loadMore = async () => {
    if (reviews.length >= total) return;
    const nextPage = page + 1;
    try {
      setLoadMoreLoading(true);
      await load(nextPage);
    } catch (e) {
      console.error('Failed to load more reviews:', e);
      toast.error(t('errors.generic') || 'Something went wrong');
    } finally {
      setLoadMoreLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2 mb-3">
          {t('profile.reviewsLoadFailed') || 'Failed to load reviews'}
        </p>
        <Button
          variant="primary"
          onClick={async () => {
            setError(false);
            setLoading(true);
            try {
              await load(1);
            } catch {
              setError(true);
            } finally {
              setLoading(false);
            }
          }}
        >
          {t('common.retry') || 'Retry'}
        </Button>
      </Card>
    );
  }

  const count = summary?.reviewCount ?? 0;
  const rating = summary?.rating ?? null;

  const listContent = (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {reviews.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onReviewClick?.(r.gameId)}
          className={`w-full text-left rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors ${compact ? 'p-2' : 'p-3'}`}
        >
          <div className="flex items-start gap-3">
            {r.reviewer && (
              <PlayerAvatar player={r.reviewer} extrasmall showName={false} fullHideName />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium text-gray-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
                  {r.reviewer
                    ? [r.reviewer.firstName, r.reviewer.lastName].filter(Boolean).join(' ') || t('profile.anonymous')
                    : t('profile.anonymous')}
                </span>
                <span className={`text-gray-500 dark:text-gray-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                  {formatDate(r.createdAt, 'PP')}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={compact ? 12 : 14}
                    className={r.stars >= s ? 'fill-amber-500 text-amber-500' : 'text-gray-300 dark:text-gray-600'}
                  />
                ))}
              </div>
              {r.updatedAt && new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 2000 && (
                <div className={`text-gray-500 dark:text-gray-400 mt-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                  {t('training.edited', { defaultValue: 'Edited' })} {formatDate(r.updatedAt, 'PPp')}
                </div>
              )}
              {r.text?.trim() && (
                <p className={`text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap break-words ${compact ? 'text-xs' : 'text-sm'}`}>
                  {r.text}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const withCard = (children: React.ReactNode) =>
    compact ? children : <Card>{children}</Card>;

  return (
    <div className="space-y-6">
      {showSummary && (
        <>
          {compact ? (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Star size={16} className="fill-current flex-shrink-0" />
                <span className="text-lg font-semibold">{rating != null ? rating.toFixed(1) : '—'}</span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('training.reviewCount', { count, defaultValue: '{{count}} reviews' })}
              </span>
            </div>
          ) : (
            <Card>
              {summaryTitleKey && (
                <h2 className="section-title mb-3">{t(summaryTitleKey) || 'Review'}</h2>
              )}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Star size={20} className="fill-current flex-shrink-0" />
                  <span className="text-xl font-semibold">{rating != null ? rating.toFixed(1) : '—'}</span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('training.reviewCount', { count, defaultValue: '{{count}} reviews' })}
                </span>
              </div>
            </Card>
          )}
        </>
      )}

      {count === 0 ? (
        withCard(
          <p className={`text-gray-500 dark:text-gray-400 py-2 ${compact ? 'text-xs' : 'text-sm'}`}>
            {t('profile.noReviewsYet') || 'No reviews yet'}
          </p>
        )
      ) : (
        withCard(
          <>
            {showTitle && (
              <h2 className={`section-title mb-3 ${compact ? 'text-base' : ''}`}>
                {t(titleKey) || 'All reviews'}
              </h2>
            )}
            {listContent}
            {reviews.length < total && (
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={loadMore}
                disabled={loadMoreLoading}
              >
                {loadMoreLoading ? (t('common.loading') || 'Loading...') : (t('profile.loadMoreReviews') || 'Load more')}
              </Button>
            )}
          </>
        )
      )}
    </div>
  );
};
