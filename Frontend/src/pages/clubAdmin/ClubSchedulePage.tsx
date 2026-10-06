/**
 * `/my-clubs/:clubId/schedule?date=&view=day|week&court=&focus=` — the schedule.
 * Day view: courts × time for one club-local date. Week view: one court × 7 days.
 * Tap a free cell → block it; tap a booking → detail (sheet on phones, side rail on desktop).
 * Polls every 15 s while visible and no sheet is open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarOff, LayoutGrid, MousePointerClick, RefreshCw } from 'lucide-react';
import type { ClubScheduleResponseV2, HoldDeleteScope, ScheduleSlotV2 } from '@shared/clubAdmin/contract';
import { addDaysToDate, isClubDate } from '@shared/clubAdmin/clubTime';
import { chatApi } from '@/api/chat';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { HeaderActions } from '@/clubAdmin/HeaderActions';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { ConsoleSheet } from '@/components/clubAdmin/console/ConsoleSheet';
import { useConsoleOverlayOpen, useIsLg } from '@/components/clubAdmin/console/consoleOverlay';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { useBookingText } from '@/components/clubAdmin/console/bookingText';
import { EmptyState, ErrorState, Skeleton } from '@/components/clubAdmin/console/primitives';
import { buttonClass, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { BookingDetail } from '@/components/clubAdmin/schedule/BookingDetail';
import { CourtActionSheet } from '@/components/clubAdmin/schedule/CourtActionSheet';
import { HoldSheet, type HoldSheetTarget } from '@/components/clubAdmin/schedule/HoldSheets';
import { ScheduleBanners, ScheduleLegend } from '@/components/clubAdmin/schedule/ScheduleBanners';
import { useScheduleExternalSync } from '@/components/clubAdmin/schedule/useScheduleExternalSync';
import { ScheduleDateBar, type ScheduleView } from '@/components/clubAdmin/schedule/ScheduleDateBar';
import { useDaySwipe } from '@/components/clubAdmin/schedule/useDaySwipe';
import { ScheduleGrid, type GridColumn } from '@/components/clubAdmin/schedule/ScheduleGrid';
import {
  UNASSIGNED_COURT,
  buildScheduleModel,
  fractionalRow,
  matchesFocus,
  resolveScheduleWindow,
  type PlacedSlot,
  type ScheduleModel,
} from '@/components/clubAdmin/schedule/scheduleModel';
import { useScheduleModel } from '@/components/clubAdmin/schedule/useScheduleModel';
import {
  clubAdminKeys,
  prefetchScheduleDay,
  useClubScheduleQuery,
  useClubSchedulesQueries,
  useDeleteHoldMutation,
  useLegacyClubInfoQuery,
} from '@/queries/clubAdmin';
import { clubAdminErrorMessageKey } from '@/api/clubAdminErrors';

interface Selection {
  colKey: string;
  placedKey: string;
}

function useWeekModels(
  dates: string[],
  datas: Array<ClubScheduleResponseV2 | undefined>,
  enabled: boolean
): ScheduleModel[] | null {
  const { t } = useTranslation('clubAdmin');
  const { clubId, context, timeZone } = useClubConsole();
  const first = datas.find(Boolean);
  const needsLegacy = enabled && !!first && (first.courts === undefined || first.hours === undefined) && !context.legacy;
  const legacyQ = useLegacyClubInfoQuery(clubId, needsLegacy);
  const legacy = context.legacy ?? legacyQ.data ?? null;
  const unassigned = t('schedule.unassigned');
  return useMemo(() => {
    if (!enabled || datas.some((d) => !d) || (needsLegacy && !legacyQ.data)) return null;
    const natural = dates.map((date, i) => resolveScheduleWindow({ date, timeZone, response: datas[i], legacy }));
    const step = Math.min(...natural.map((w) => w.step));
    const start = Math.min(...natural.map((w) => w.rows[0] ?? 0));
    const end = Math.max(...natural.map((w) => (w.rows[w.rows.length - 1] ?? 0) + w.step));
    return dates.map((date, i) =>
      buildScheduleModel({ date, timeZone, response: datas[i], legacy, unassignedLabel: unassigned, range: { start, end, step } })
    );
  }, [enabled, datas, dates, timeZone, legacy, needsLegacy, legacyQ.data, unassigned]);
}

export function ClubSchedulePage() {
  const { t } = useTranslation('clubAdmin');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isLg = useIsLg();
  const overlayOpen = useConsoleOverlayOpen();
  const { clubId, context, today, timeZone, nowMs, can, isV2 } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const text = useBookingText();
  const [params, setParams] = useSearchParams();
  useConsoleHeader({ title: t('nav.schedule'), fill: true });

  const rawDate = params.get('date');
  const date = isClubDate(rawDate) ? rawDate : today;
  const view: ScheduleView = params.get('view') === 'week' ? 'week' : 'day';
  const focus = params.get('focus');
  const canEdit = can('schedule.edit');

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // ---------------- data ----------------
  const dayQ = useClubScheduleQuery(clubId, date, { paused: overlayOpen, enabled: view === 'day' });
  const { model: dayModel } = useScheduleModel(view === 'day' ? dayQ.data : undefined, date);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToDate(date, i)), [date]);
  const weekQs = useClubSchedulesQueries(clubId, weekDates, { paused: overlayOpen, enabled: view === 'week' });
  const weekDatas = useMemo(() => weekQs.map((q) => q.data), [weekQs]);
  const weekModels = useWeekModels(weekDates, weekDatas, view === 'week');

  useEffect(() => {
    if (view !== 'day' || !dayQ.isSuccess) return;
    void prefetchScheduleDay(qc, clubId, addDaysToDate(date, 1));
    void prefetchScheduleDay(qc, clubId, addDaysToDate(date, -1));
  }, [view, dayQ.isSuccess, qc, clubId, date]);

  const weekCourts = (weekModels?.[0]?.courts ?? []).filter((c) => c.key !== UNASSIGNED_COURT);
  const weekCourtId = params.get('court') && weekCourts.some((c) => c.key === params.get('court')) ? params.get('court')! : weekCourts[0]?.key ?? null;

  // ---------------- columns ----------------
  const columns: GridColumn[] = useMemo(() => {
    if (view === 'day') {
      if (!dayModel) return [];
      return dayModel.courts.map((c) => ({
        key: c.key,
        title: c.name,
        isIndoor: c.isIndoor,
        window: dayModel.window,
        placed: dayModel.index.get(c.key) ?? [],
        covered: dayModel.covered.get(c.key) ?? [],
        readOnly: !canEdit || c.key === UNASSIGNED_COURT || !c.isActive,
      }));
    }
    if (!weekModels || !weekCourtId) return [];
    return weekModels.map((m) => ({
      key: m.window.date,
      title: m.window.date === today ? t('common.today') : fmt.weekdayShort(m.window.date),
      subtitle: fmt.dayOfMonth(m.window.date),
      highlight: m.window.date === today,
      window: m.window,
      placed: m.index.get(weekCourtId) ?? [],
      covered: m.covered.get(weekCourtId) ?? [],
      readOnly: !canEdit,
    }));
  }, [view, dayModel, weekModels, weekCourtId, canEdit, today, t, fmt]);

  const rows = view === 'day' ? (dayModel?.window.rows ?? []) : (weekModels?.[0]?.window.rows ?? []);
  const courtsForSheets = (view === 'day' ? dayModel?.courts : weekModels?.[0]?.courts) ?? [];
  const loading = view === 'day' ? dayQ.isPending || (!!dayQ.data && !dayModel) : weekQs.some((q) => q.isPending) || !weekModels;
  const error = view === 'day' ? dayQ.isError && !dayQ.data : weekQs.some((q) => q.isError && !q.data);
  const fetching = view === 'day' ? dayQ.isFetching : weekQs.some((q) => q.isFetching);

  // ---------------- selection ----------------
  const [selection, setSelection] = useState<Selection | null>(null);
  const resolved = useMemo(() => {
    if (!selection) return null;
    const col = columns.find((c) => c.key === selection.colKey);
    const placed = col?.placed.find((p) => p.key === selection.placedKey);
    return col && placed ? { col, placed } : null;
  }, [selection, columns]);

  useEffect(() => {
    setSelection(null);
  }, [date, view, weekCourtId]);

  // Focus a booking handed over from Today / Bookings, then drop the param.
  useEffect(() => {
    if (!focus || columns.length === 0) return;
    for (const c of columns) {
      const hit = c.placed.find((p) => matchesFocus(focus, p.slot));
      if (hit) {
        setSelection({ colKey: c.key, placedKey: hit.key });
        break;
      }
    }
    setParam({ focus: null });
  }, [focus, columns, setParam]);

  // Scroll target: recomputed when the day / view / court / selection changes — never on a poll.
  const [scrollTarget, setScrollTarget] = useState<{ row: number; key: string } | null>(null);
  const scrollKey = `${date}|${view}|${weekCourtId ?? ''}|${resolved?.placed.key ?? ''}|${columns.length > 0 ? 1 : 0}`;
  const lastScrollKey = useRef('');
  useEffect(() => {
    if (lastScrollKey.current === scrollKey) return;
    lastScrollKey.current = scrollKey;
    const col = columns[0];
    if (!col) return;
    let row = 0;
    if (resolved) row = Math.floor(resolved.placed.startRow);
    else if (nowMs >= col.window.rowInstants[0] && nowMs <= col.window.rowInstants[col.window.rowInstants.length - 1]) {
      row = Math.floor(fractionalRow(col.window, nowMs));
    } else {
      let first: number | null = null;
      for (const c of columns) for (const p of c.placed) first = first === null ? p.startRow : Math.min(first, p.startRow);
      row = first === null ? 0 : Math.floor(first);
    }
    setScrollTarget({ row, key: scrollKey });
  }, [scrollKey, columns, resolved, nowMs]);

  // ---------------- sheets ----------------
  const [holdTarget, setHoldTarget] = useState<HoldSheetTarget | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [courtAction, setCourtAction] = useState<'cancel' | 'clear' | null>(null);
  const deleteHold = useDeleteHoldMutation(clubId);

  const columnCourtId = (col: GridColumn) => (view === 'day' ? col.key : weekCourtId);
  const columnDate = (col: GridColumn) => (view === 'day' ? date : col.key);

  const onFreeRange = (col: GridColumn, from: number, to: number) => {
    const courtId = columnCourtId(col);
    if (!courtId || courtId === UNASSIGNED_COURT || col.readOnly) return;
    const step = col.window.step;
    setSelection(null);
    setHoldTarget({
      kind: 'create',
      courtId,
      date: columnDate(col),
      startMin: rows[from],
      durationMin: to - from > 1 ? (to - from) * step : Math.max(60, step),
    });
    setHoldOpen(true);
  };

  const onSlot = (col: GridColumn, placed: PlacedSlot) => setSelection({ colKey: col.key, placedKey: placed.key });

  const courtName = (slot: ScheduleSlotV2) =>
    slot.courtId === null
      ? t('schedule.unassigned')
      : courtsForSheets.find((c) => c.key === slot.courtId)?.name ?? (slot.type === 'external' ? slot.courtName ?? '' : t('common.court'));

  const messageHost = async (hostId: string) => {
    try {
      const res = await chatApi.getOrCreateChatWithUser(hostId);
      if (res?.data?.id) navigate(`/user-chat/${res.data.id}`);
    } catch (e) {
      toast.error(t(clubAdminErrorMessageKey(e)));
    }
  };

  const selectedSlot = resolved?.placed.slot ?? null;
  const detail = selectedSlot ? (
    <BookingDetail
      slot={selectedSlot}
      courtName={courtName(selectedSlot)}
      fmt={fmt}
      nowMs={nowMs}
      canEdit={canEdit}
      deleting={deleteHold.isPending}
      nestedSheets={!isLg}
      actions={{
        onOpenGame: (gameId) => navigate(`/games/${gameId}`),
        onMessageHost: (hostId) => void messageHost(hostId),
        onCourtAction: (mode) => setCourtAction(mode),
        onEditHold: () => {
          if (selectedSlot.type !== 'hold') return;
          setHoldTarget({ kind: 'edit', hold: selectedSlot });
          setHoldOpen(true);
        },
        onDeleteHold: async (scope: HoldDeleteScope) => {
          if (selectedSlot.type !== 'hold') return;
          try {
            await deleteHold.mutateAsync({
              holdId: selectedSlot.holdId,
              scope,
              seriesId: selectedSlot.seriesId,
              startTime: selectedSlot.startTime,
            });
            setSelection(null);
            toast.success(t('detail.deleted'));
          } catch {
            // toast from the mutation; keep the detail open.
          }
        },
      }}
    />
  ) : null;

  const refresh = () => void qc.invalidateQueries({ queryKey: clubAdminKeys.scheduleAll(clubId) });
  const { syncing } = useScheduleExternalSync(clubId, date, timeZone, !!context.club.integrationType, refresh);
  const swipe = useDaySwipe((d) => setParam({ date: addDaysToDate(date, d * (view === 'week' ? 7 : 1)) }), !isLg && columns.length <= 3);
  const dayData = view === 'day' ? dayQ.data : weekDatas[0];
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => setShowClosed(false), [date]);
  const closedDay = view === 'day' && !!dayModel?.window.closed && (dayQ.data?.slots.length ?? 0) === 0 && !showClosed;
  const noCourts = !loading && columns.length === 0 && (view === 'day' ? !!dayModel : !!weekModels);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <HeaderActions>
        <button type="button" className={iconButtonClass} onClick={refresh} aria-label={t('common.refresh')}>
          <RefreshCw className={fetching ? 'h-5 w-5 animate-spin motion-reduce:animate-none' : 'h-5 w-5'} aria-hidden />
        </button>
      </HeaderActions>
      <ScheduleDateBar
        date={date}
        today={today}
        view={view}
        fmt={fmt}
        onDate={(d) => setParam({ date: d === today ? null : d })}
        onView={(v) => setParam({ view: v === 'day' ? null : v })}
        trailing={
          view === 'week' && weekCourts.length > 0 ? (
            <select
              aria-label={t('schedule.weekCourt')}
              className="h-8 max-w-[9rem] rounded-lg border border-border bg-ca-surface px-2 text-sm"
              value={weekCourtId ?? ''}
              onChange={(e) => setParam({ court: e.target.value })}
            >
              {weekCourts.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <ScheduleBanners
        data={dayData}
        integrationType={context.club.integrationType}
        courtsHref={`${consoleBase(clubId)}/club/courts`}
        canEditCourts={can('courts.edit')}
        isToday={date === today}
        syncing={syncing}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" {...swipe}>
          <div className="min-h-0 flex-1">
            {error ? (
              <ErrorState onRetry={refresh} />
            ) : loading ? (
              <div className="space-y-2 p-4" role="status" aria-label={t('common.loading')}>
                <Skeleton className="h-10 w-full" />
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : closedDay ? (
              <EmptyState
                icon={CalendarOff}
                title={t('schedule.closedTitle')}
                body={t('schedule.closedBody')}
                action={
                  <button type="button" className={buttonClass('secondary')} onClick={() => setShowClosed(true)}>
                    {t('schedule.showAnyway')}
                  </button>
                }
              />
            ) : noCourts ? (
              <EmptyState
                icon={LayoutGrid}
                title={t('schedule.noCourtsTitle')}
                body={t('schedule.noCourtsBody')}
                action={
                  can('courts.edit') ? (
                    <button type="button" className={buttonClass('primary')} onClick={() => navigate(`${consoleBase(clubId)}/club/courts`)}>
                      {t('schedule.addCourts')}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <ScheduleGrid
                columns={columns}
                rows={rows}
                nowMs={nowMs}
                fmt={fmt}
                selectedKey={resolved ? `${resolved.col.key}|${resolved.placed.key}` : null}
                onFreeRange={onFreeRange}
                onSlot={onSlot}
                scrollTarget={scrollTarget}
                ariaLabel={view === 'day' ? t('schedule.gridLabel', { date: fmt.dateLong(date) }) : t('schedule.weekGridLabel')}
                fetching={fetching}
              />
            )}
          </div>
          <div className="shrink-0 border-t border-border bg-ca-surface px-3 py-2 lg:px-4">
            <ScheduleLegend />
          </div>
        </div>
        {isLg ? (
          <aside
            className="w-[22rem] shrink-0 overflow-y-auto border-s border-border bg-ca-surface p-4"
            aria-label={t('detail.railLabel')}
          >
            {detail ?? (
              <EmptyState
                compact
                icon={MousePointerClick}
                title={t('detail.railEmptyTitle')}
                body={canEdit ? t('detail.railEmptyBody') : t('detail.railEmptyBodyReadOnly')}
              />
            )}
          </aside>
        ) : null}
      </div>

      {!isLg ? (
        <ConsoleSheet
          open={!!selectedSlot && !holdOpen && !courtAction}
          onOpenChange={(o) => !o && setSelection(null)}
          modalId="club-admin-booking-detail"
          title={selectedSlot ? text.title(selectedSlot) : ''}
        >
          {detail}
        </ConsoleSheet>
      ) : null}

      <HoldSheet
        open={holdOpen}
        onOpenChange={(o) => {
          setHoldOpen(o);
          if (!o && holdTarget?.kind === 'edit') setSelection(null);
        }}
        target={holdTarget}
        courts={courtsForSheets}
        rowMinutes={rows}
        clubId={clubId}
        timeZone={timeZone}
        nowMs={nowMs}
        fmt={fmt}
        isV2={isV2}
      />
      <CourtActionSheet
        open={!!courtAction && !!selectedSlot}
        onOpenChange={(o) => !o && setCourtAction(null)}
        mode={courtAction ?? 'cancel'}
        game={selectedSlot && (selectedSlot.type === 'game' || selectedSlot.type === 'game_court') ? selectedSlot : null}
        clubId={clubId}
        clubName={context.club.name}
        timeZone={timeZone}
        fmt={fmt}
        onDone={() => {
          setCourtAction(null);
          setSelection(null);
          toast.success(t('courtAction.done'));
        }}
      />
    </div>
  );
}

