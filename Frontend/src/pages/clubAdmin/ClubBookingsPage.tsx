/**
 * `/my-clubs/:clubId/bookings?scope=&court=&kinds=&payment=&q=` — every booking, infinite,
 * grouped by club-local day under sticky headers. `GET /bookings` (cursor); on an older backend
 * the legacy upcoming list with client-side filters (no Past, no payment filter).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ListChecks, Search } from 'lucide-react';
import type { BookingKind, BookingScope, ChargeStatus } from '@shared/clubAdmin/contract';
import { addDaysToDate } from '@shared/clubAdmin/clubTime';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { groupBookingsByDay } from '@/components/clubAdmin/bookings/groupByDay';
import { BookingRow } from '@/components/clubAdmin/console/BookingRow';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { FilterChips, SegmentedControl, inputClass } from '@/components/clubAdmin/console/controls';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { EmptyState, ErrorState, RowList, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx } from '@/components/clubAdmin/console/classes';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { sectionPath } from '@/clubAdmin/consoleNav';
import { clubAdminKeys, flattenBookings, useClubBookingsQuery, useClubScheduleQuery, type BookingsFilters } from '@/queries/clubAdmin';

const KINDS: BookingKind[] = ['game', 'hold', 'external'];
const PAYMENTS: Array<ChargeStatus | 'NONE'> = ['UNPAID', 'PARTIAL', 'PAID', 'NONE'];

function parseKinds(raw: string | null): BookingKind[] {
  return (raw ?? '').split(',').filter((k): k is BookingKind => (KINDS as string[]).includes(k));
}

export function ClubBookingsPage() {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const { clubId, context, today, timeZone, nowMs, can } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const scrollRef = useClubAdminScrollContainer();
  const [params, setParams] = useSearchParams();
  useConsoleHeader({ title: t('nav.bookings') });

  const scope: BookingScope = params.get('scope') === 'past' ? 'past' : 'upcoming';
  const courtId = params.get('court');
  const kinds = parseKinds(params.get('kinds'));
  const paymentRaw = params.get('payment');
  const payment = (PAYMENTS as string[]).includes(paymentRaw ?? '') ? (paymentRaw as ChargeStatus | 'NONE') : null;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounce(search, 300);

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const urlQ = params.get('q') ?? '';
  useEffect(() => {
    if (urlQ !== q.trim()) setParam({ q: q.trim() || null });
  }, [q, urlQ, setParam]);

  const filters: BookingsFilters = { scope, courtId, kinds, payment, q };
  const list = useClubBookingsQuery(clubId, filters);
  const items = flattenBookings(list.data?.pages);
  const legacy = list.data?.pages[0]?.legacy ?? false;
  const groups = useMemo(() => groupBookingsByDay(items, timeZone), [items, timeZone]);

  // Courts for the court filter: today's schedule (cached from Today/Schedule) or the legacy club row.
  const todayQ = useClubScheduleQuery(clubId, today, { paused: true });
  const courts = (todayQ.data?.courts ?? context.legacy?.courts ?? []).filter((c) => c.isActive);

  // Infinite scroll; a failed page stops the observer until the operator retries.
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

  const dayLabel = (date: string) =>
    date === today
      ? `${t('common.today')} · ${fmt.dateMedium(date)}`
      : date === addDaysToDate(today, 1)
        ? `${t('common.tomorrow')} · ${fmt.dateMedium(date)}`
        : date === addDaysToDate(today, -1)
          ? `${t('common.yesterday')} · ${fmt.dateMedium(date)}`
          : fmt.dateLong(date);

  const showPayment = !legacy && (can('billing.collect') || can('reports.revenue'));
  const filtered = !!courtId || kinds.length > 0 || !!payment || !!q.trim();
  const schedule = sectionPath(clubId, 'schedule');

  return (
    <ConsolePullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: clubAdminKeys.bookingsAll(clubId) })}>
      <div className="mx-auto w-full max-w-3xl space-y-3 p-4 pb-8 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {!legacy || scope === 'past' ? (
            <SegmentedControl<BookingScope>
              ariaLabel={t('bookings.scopeLabel')}
              value={scope}
              onChange={(v) => setParam({ scope: v === 'upcoming' ? null : v })}
              options={[
                { value: 'upcoming', label: t('bookings.upcoming') },
                { value: 'past', label: t('bookings.past') },
              ]}
            />
          ) : null}
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              className={cx(inputClass, 'ps-9')}
              placeholder={t('bookings.search')}
              aria-label={t('bookings.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <FilterChips
          ariaLabel={t('bookings.kindFilter')}
          options={KINDS.map((k) => ({ value: k, label: t(`kind.plural.${k}`) }))}
          selected={kinds}
          onToggle={(k) => {
            const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
            setParam({ kinds: next.join(',') || null });
          }}
        />
        {courts.length > 1 ? (
          <FilterChips
            ariaLabel={t('bookings.courtFilter')}
            options={courts.map((c) => ({ value: c.id, label: c.name }))}
            selected={courtId ? [courtId] : []}
            onToggle={(id) => setParam({ court: id === courtId ? null : id })}
          />
        ) : null}
        {showPayment ? (
          <FilterChips
            ariaLabel={t('bookings.paymentFilter')}
            options={PAYMENTS.map((p) => ({ value: p, label: t(`billing.${p}`) }))}
            selected={payment ? [payment] : []}
            onToggle={(p) => setParam({ payment: p === payment ? null : p })}
          />
        ) : null}

        {list.isPending ? (
          <SkeletonRows rows={6} />
        ) : list.isError && items.length === 0 ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={filtered ? t('bookings.emptyFilteredTitle') : scope === 'past' ? t('bookings.emptyPastTitle') : t('bookings.emptyTitle')}
            body={filtered ? t('bookings.emptyFilteredBody') : t('bookings.emptyBody')}
            action={
              filtered ? (
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => {
                    setSearch('');
                    setParam({ court: null, kinds: null, payment: null, q: null });
                  }}
                >
                  {t('bookings.clearFilters')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.date} aria-label={dayLabel(g.date)}>
                <h2 className="sticky top-0 z-10 -mx-1 bg-background/95 px-2 py-2 text-[13px] font-semibold text-muted-foreground backdrop-blur tabular-nums">
                  {dayLabel(g.date)}
                  <span className="ms-2 font-normal">· {t('bookings.count', { count: g.items.length })}</span>
                </h2>
                <RowList>
                  {g.items.map((b) => (
                    <BookingRow
                      key={b.id}
                      item={b}
                      fmt={fmt}
                      nowMs={nowMs}
                      to={`${schedule}?date=${g.date}&focus=${encodeURIComponent(b.id)}`}
                    />
                  ))}
                </RowList>
              </section>
            ))}
            {hasNextPage ? (
              <div ref={sentinelRef} className="py-2">
                {isFetchNextPageError ? (
                  <ErrorState compact onRetry={() => void fetchNextPage()} />
                ) : isFetchingNextPage ? (
                  <SkeletonRows rows={2} />
                ) : null}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">{t('bookings.end')}</p>
            )}
          </div>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
