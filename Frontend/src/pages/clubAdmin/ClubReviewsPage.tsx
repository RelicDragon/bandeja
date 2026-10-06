/**
 * `/my-clubs/:clubId/club/reviews` (`reviews.view`) — all-time summary (average, 1–5 distribution)
 * and every review, newest first, infinite (`GET /reviews`, keyset). Read-only.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageSquareText, Star } from 'lucide-react';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { personName } from '@/components/clubAdmin/console/bookingText';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { Card, EmptyState, ErrorState, RowList, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { cx } from '@/components/clubAdmin/console/classes';
import { PersonFace } from '@/components/clubAdmin/club/PersonFace';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { clubAreaKeys, useClubReviewsQuery } from '@/queries/clubAdmin/clubArea';

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cx('h-3.5 w-3.5', n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-border')}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function ClubReviewsPage() {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const { clubId, timeZone } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const scrollRef = useClubAdminScrollContainer();
  useConsoleHeader({ title: t('club.pages.reviews.title'), backTo: `${consoleBase(clubId)}/club` });

  const list = useClubReviewsQuery(clubId);
  const summary = list.data?.pages[0]?.summary ?? null;
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);
  const maxBucket = summary ? Math.max(1, ...[1, 2, 3, 4, 5].map((n) => summary.distribution[n as 1 | 2 | 3 | 4 | 5] ?? 0)) : 1;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = list;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchNextPageError) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollRef?.current ?? null, rootMargin: '240px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError, scrollRef, items.length]);

  return (
    <ConsolePullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: clubAreaKeys.reviews(clubId) })}>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-8 lg:p-6">
        {list.isPending ? (
          <SkeletonRows rows={5} />
        ) : list.isError && items.length === 0 ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : !summary || summary.count === 0 ? (
          <EmptyState icon={MessageSquareText} title={t('club.reviews.emptyTitle')} body={t('club.reviews.emptyBody')} />
        ) : (
          <>
            <Card className="flex items-center gap-5 p-4">
              <div className="text-center">
                <div className="text-4xl font-semibold tabular-nums text-foreground">
                  {summary.averageStars !== null ? summary.averageStars.toFixed(1) : '—'}
                </div>
                <Stars value={summary.averageStars ?? 0} label={t('club.reviews.average', { value: summary.averageStars?.toFixed(1) ?? '—' })} />
                <div className="mt-1 text-xs text-muted-foreground">{t('club.reviews.count', { count: summary.count })}</div>
              </div>
              <ul className="flex-1 space-y-1" aria-label={t('club.reviews.distribution')}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = summary.distribution[n as 1 | 2 | 3 | 4 | 5] ?? 0;
                  return (
                    <li key={n} className="flex items-center gap-2 text-xs" aria-label={t('club.reviews.bucket', { stars: n, count: c })}>
                      <span className="w-3 text-end tabular-nums text-muted-foreground" aria-hidden>
                        {n}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ca-sunken" aria-hidden>
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(c / maxBucket) * 100}%` }} />
                      </span>
                      <span className="w-8 tabular-nums text-muted-foreground" aria-hidden>
                        {c}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <RowList>
              <ul>
                {items.map((r) => (
                  <li key={r.id} className="space-y-2 px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <PersonFace person={r.author} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{personName(r.author) || t('club.reviews.formerPlayer')}</p>
                        <p className="text-xs text-muted-foreground">{fmt.dateTime(r.createdAt)}</p>
                      </div>
                      <Stars value={r.stars} label={t('club.reviews.stars', { count: r.stars })} />
                    </div>
                    {r.text ? <p className="whitespace-pre-line text-sm text-foreground">{r.text}</p> : null}
                    {r.photos.length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto">
                        {r.photos.map((src) => (
                          <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={src} alt="" loading="lazy" className="h-16 w-16 rounded-lg object-cover" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </RowList>
            {hasNextPage ? (
              <div ref={sentinelRef} className="py-2">
                {isFetchNextPageError ? <ErrorState compact onRetry={() => void fetchNextPage()} /> : <SkeletonRows rows={2} />}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">{t('club.reviews.end')}</p>
            )}
          </>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
