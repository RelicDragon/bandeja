/**
 * `/my-clubs/:clubId/club/activity?group=` (`activity.view`) — who changed what, newest first,
 * grouped by club-local day, infinite (`GET /activity`, keyset). The group filter narrows to one
 * family of actions; the endpoint filters one action at a time, so a group is filtered on the
 * loaded pages and the list keeps paging until it has rows to show.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import type { ClubActivityItem } from '@shared/clubAdmin/contract';
import { addDaysToDate, clubLocalDate } from '@shared/clubAdmin/clubTime';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { FilterChips } from '@/components/clubAdmin/console/controls';
import { personName } from '@/components/clubAdmin/console/bookingText';
import { useConsoleFormat, type ConsoleFormat } from '@/components/clubAdmin/console/format';
import { EmptyState, ErrorState, RowList, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { ACTIVITY_GROUPS, ACTIVITY_GROUP_IDS, activitySentence, type ActivityGroup } from '@/components/clubAdmin/club/activityModel';
import { PersonFace } from '@/components/clubAdmin/club/PersonFace';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { formatCents } from '@/components/clubAdmin/billing/money';
import { clubAreaKeys, useClubActivityQuery } from '@/queries/clubAdmin/clubArea';

function ActivityRow({ item, fmt, currency }: { item: ClubActivityItem; fmt: ConsoleFormat; currency: string }) {
  const { t } = useTranslation('clubAdmin');
  const s = activitySentence(item);
  const actor = personName(item.actor) || t('club.activity.someone');
  const values: Record<string, string | number> = {
    ...s.values,
    actor,
    when: s.startTime ? fmt.dateTime(s.startTime) : '',
    amount: s.amountCents !== null ? formatCents(s.amountCents, s.currency ?? currency, fmt.locale) : '',
  };
  if (typeof values.label === 'string') values.label = t(`holdLabel.${values.label}`, { defaultValue: values.label });
  if (typeof values.role === 'string') values.role = t(`club.team.role.${values.role}`, { defaultValue: values.role });
  if (typeof values.status === 'string') values.status = t(`billing.${values.status}`, { defaultValue: values.status });
  if (typeof values.method === 'string') values.method = t(`club.activity.method.${values.method}`, { defaultValue: values.method });
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <PersonFace person={item.actor} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{t(`club.activity.action.${s.key}`, values)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{fmt.time(item.createdAt)}</p>
      </div>
    </li>
  );
}

export function ClubActivityPage() {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const { clubId, context, today, timeZone } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const scrollRef = useClubAdminScrollContainer();
  const [params, setParams] = useSearchParams();
  useConsoleHeader({ title: t('club.pages.activity.title'), backTo: `${consoleBase(clubId)}/club` });

  const groupRaw = params.get('group');
  const group = (ACTIVITY_GROUP_IDS as string[]).includes(groupRaw ?? '') ? (groupRaw as ActivityGroup) : null;
  const actions = group ? ACTIVITY_GROUPS[group] : null;
  const list = useClubActivityQuery(clubId, actions);
  const items = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);

  const days = useMemo(() => {
    const out: Array<{ date: string; items: ClubActivityItem[] }> = [];
    for (const item of items) {
      const date = clubLocalDate(new Date(item.createdAt), timeZone);
      const last = out[out.length - 1];
      if (last && last.date === date) last.items.push(item);
      else out.push({ date, items: [item] });
    }
    return out;
  }, [items, timeZone]);

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError, scrollRef]);

  const dayLabel = (date: string) =>
    date === today
      ? t('common.today')
      : date === addDaysToDate(today, -1)
        ? t('common.yesterday')
        : fmt.dateLong(date);

  return (
    <ConsolePullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: clubAreaKeys.activity(clubId, actions) })}>
      <div className="mx-auto w-full max-w-2xl space-y-3 p-4 pb-8 lg:p-6">
        <FilterChips
          ariaLabel={t('club.activity.filter')}
          options={ACTIVITY_GROUP_IDS.map((g) => ({ value: g, label: t(`club.activity.group.${g}`) }))}
          selected={group ? [group] : []}
          onToggle={(g) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (g === group) next.delete('group');
                else next.set('group', g);
                return next;
              },
              { replace: true }
            )
          }
        />
        {list.isPending ? (
          <SkeletonRows rows={6} />
        ) : list.isError && items.length === 0 ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={ScrollText} title={t('club.activity.emptyTitle')} body={group ? t('club.activity.emptyFiltered') : t('club.activity.emptyBody')} />
        ) : (
          <div className="space-y-4">
            {days.map((d) => (
              <section key={d.date} aria-label={dayLabel(d.date)}>
                <h2 className="sticky top-0 z-10 -mx-1 bg-background/95 px-2 py-2 text-[13px] font-semibold text-muted-foreground backdrop-blur">
                  {dayLabel(d.date)}
                </h2>
                <RowList>
                  <ul>
                    {d.items.map((item) => (
                      <ActivityRow key={item.id} item={item} fmt={fmt} currency={context.club.currency} />
                    ))}
                  </ul>
                </RowList>
              </section>
            ))}
            {hasNextPage ? (
              <div ref={sentinelRef} className="py-2">
                {isFetchNextPageError ? <ErrorState compact onRetry={() => void fetchNextPage()} /> : <SkeletonRows rows={2} />}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">{t('club.activity.end')}</p>
            )}
          </div>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
