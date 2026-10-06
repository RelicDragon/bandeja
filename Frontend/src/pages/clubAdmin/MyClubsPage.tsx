/**
 * `/my-clubs` — the club picker. One club and no search: go straight to it (replace, so back
 * leaves the console). "Open now" is judged on each club's own wall clock.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ClubAvatar } from '@/components/ClubAvatar';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { inputClass } from '@/components/clubAdmin/console/controls';
import { isClubOpenAt } from '@/components/clubAdmin/console/hours';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { useConsoleBack } from '@/clubAdmin/useConsoleBack';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { flattenClubs, useClubAdminClubsQuery } from '@/queries/clubAdmin';
import { parseClubAdminError } from '@/api/clubAdminErrors';

const SEARCH_FROM = 6;

export function MyClubsPage() {
  const { t } = useTranslation('clubAdmin');
  const back = useConsoleBack();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const clubs = useClubAdminClubsQuery(debounced);
  const items = flattenClubs(clubs.data?.pages);
  const total = clubs.data?.pages[0]?.total ?? items.length;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = clubs;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isError) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: '160px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isError, items.length]);

  if (!debounced && !query && clubs.isSuccess && items.length === 1 && !hasNextPage) {
    return <Navigate to={consoleBase(items[0].id)} replace />;
  }

  const forbidden = clubs.isError && parseClubAdminError(clubs.error).status === 403;

  return (
    <div className="safe-area-left safe-area-right flex h-dvh flex-col bg-background text-foreground">
      <header className="safe-area-top shrink-0 border-b border-border bg-ca-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1.5 px-2">
          <button type="button" className={iconButtonClass} onClick={() => back('/')} aria-label={t('nav.backToApp')}>
            <ChevronLeft className="h-6 w-6 rtl:-scale-x-100" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{t('myClubs')}</h1>
        </div>
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="safe-area-bottom mx-auto w-full max-w-2xl space-y-3 p-4">
          {total > SEARCH_FROM || query ? (
            <input
              type="search"
              className={inputClass}
              placeholder={t('picker.search')}
              aria-label={t('picker.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          ) : null}
          {clubs.isPending ? (
            <SkeletonRows rows={4} />
          ) : forbidden ? (
            <ErrorState kind="forbidden" />
          ) : clubs.isError && items.length === 0 ? (
            <ErrorState onRetry={() => void clubs.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={query ? t('picker.noResults') : t('picker.empty')}
              body={query ? undefined : t('picker.emptyHint')}
            />
          ) : (
            <ul className="space-y-2">
              {items.map((c) => {
                const open = isClubOpenAt(c.openingTime, c.closingTime, c.city.timezone);
                return (
                  <li key={c.id}>
                    <Link
                      to={consoleBase(c.id)}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-ca-surface p-3 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      <ClubAvatar club={{ id: c.id, name: c.name, avatar: c.avatar }} className="h-12 w-12 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground tabular-nums">
                          {c.city.name} · {t('picker.courts', { count: c.courtsCount })}
                          {c.bookingsToday > 0 ? ` · ${t('picker.bookingsToday', { count: c.bookingsToday })}` : ''}
                        </p>
                        {open !== null ? (
                          <p className={cx('mt-0.5 flex items-center gap-1.5 text-xs font-medium', open ? 'text-ca-ok' : 'text-muted-foreground')}>
                            <span className={cx('h-1.5 w-1.5 rounded-full', open ? 'bg-ca-ok' : 'bg-muted-foreground/50')} aria-hidden />
                            {open ? t('picker.openNow') : t('picker.closedNow')}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {hasNextPage ? (
            <div ref={sentinelRef} className="py-2">
              {isFetchingNextPage ? <SkeletonRows rows={1} /> : null}
              {clubs.isError && items.length > 0 ? (
                <ErrorState compact onRetry={() => void fetchNextPage()} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
