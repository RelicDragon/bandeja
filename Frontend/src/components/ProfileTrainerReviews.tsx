import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import { Card, Loading, PlayerAvatar, Button } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { trainersApi } from '@/api/trainers';
import { formatDate } from '@/utils/dateFormat';
import type { TrainerReview } from '@/types';

const REVIEWS_PAGE_SIZE = 20;

export const ProfileTrainerReviews = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [summary, setSummary] = useState<{ rating: number | null; reviewCount: number } | null>(null);
  const [reviews, setReviews] = useState<TrainerReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async (pageNum: number) => {
    if (!user?.id) return;
    const res = await trainersApi.getReviews(user.id, { page: pageNum, limit: REVIEWS_PAGE_SIZE });
    const payload = res?.data;
    if (payload) {
      setSummary(payload.summary ? { rating: payload.summary.rating, reviewCount: payload.summary.reviewCount } : null);
      setReviews((prev) => (pageNum === 1 ? (payload.reviews ?? []) : [...prev, ...(payload.reviews ?? [])]));
      setTotal(payload.total ?? 0);
      setPage(pageNum);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !user?.isTrainer) return;
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
  }, [user?.id, user?.isTrainer, load, t]);

  const loadMore = async () => {
    if (!user?.id || reviews.length >= total) return;
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

  const rating = summary?.rating ?? user?.trainerRating ?? null;
  const count = summary?.reviewCount ?? user?.trainerReviewCount ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="section-title mb-3">
          {t('profile.review') || 'Review'}
        </h2>
        {count === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
            {t('profile.noReviewsYet') || 'No reviews yet'}
          </p>
        ) : (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Star size={20} className="fill-current flex-shrink-0" />
              <span className="text-xl font-semibold">{rating != null ? rating.toFixed(1) : '—'}</span>
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('training.reviewCount', { count, defaultValue: '{{count}} reviews' })}
            </span>
          </div>
        )}
      </Card>

      {reviews.length > 0 && (
        <Card>
          <h2 className="section-title mb-3">
            {t('profile.allReviews') || 'All reviews'}
          </h2>
          <div className="space-y-4">
            {reviews.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/games/${r.gameId}`)}
                className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {r.reviewer && (
                    <PlayerAvatar player={r.reviewer} extrasmall showName={false} fullHideName />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {r.reviewer
                          ? [r.reviewer.firstName, r.reviewer.lastName].filter(Boolean).join(' ') || t('profile.anonymous')
                          : t('profile.anonymous')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(r.createdAt, 'PP')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={14}
                          className={r.stars >= s ? 'fill-amber-500 text-amber-500' : 'text-gray-300 dark:text-gray-600'}
                        />
                      ))}
                    </div>
                    {r.updatedAt && new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 2000 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                        {t('training.edited', { defaultValue: 'Edited' })} {formatDate(r.updatedAt, 'PPp')}
                      </div>
                    )}
                    {r.text?.trim() && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap break-words">
                        {r.text}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
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
        </Card>
      )}
    </div>
  );
};
