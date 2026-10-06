/**
 * `/my-clubs/:clubId/club/courts` (`courts.edit`) — every court in console order. Reorder by drag
 * (desktop) or move buttons (phones), `POST /courts/reorder`, optimistic. Add/edit in a sheet;
 * switching a court off first shows what is still booked on it (`GET /courts/:id/impact`) —
 * those bookings stay, the court just stops taking new ones.
 */
import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, GripVertical, Home, LayoutGrid, Loader2, Plus, Power, Sun } from 'lucide-react';
import type { ClubAdminCourt } from '@shared/clubAdmin/contract';
import { ClubAdminCourtForm, type CourtFormValues } from '@/components/clubAdmin/ClubAdminCourtForm';
import { ConfirmSheet } from '@/components/clubAdmin/club/formChrome';
import { movePhoto as moveItem } from '@/components/clubAdmin/club/photoOrder';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { EmptyState, ErrorState, RowList, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { HeaderActions } from '@/clubAdmin/HeaderActions';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import {
  useClubCourtsQuery,
  useClubProfileQuery,
  useCourtImpactQuery,
  useReorderCourtsMutation,
  useUpsertCourtMutation,
} from '@/queries/clubAdmin/clubArea';
import { getSportConfig } from '@/sport/sportRegistry';
import { formatCents } from '@/components/clubAdmin/billing/money';
import type { Sport } from '@/types';

export function ClubCourtsPage() {
  const { t } = useTranslation('clubAdmin');
  const { t: tApp } = useTranslation();
  const { clubId, context, timeZone } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  useConsoleHeader({ title: t('club.pages.courts.title'), backTo: `${consoleBase(clubId)}/club` });

  const courtsQ = useClubCourtsQuery(clubId);
  const profileQ = useClubProfileQuery(clubId);
  const upsert = useUpsertCourtMutation(clubId);
  const reorder = useReorderCourtsMutation(clubId);
  const [editing, setEditing] = useState<ClubAdminCourt | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<ClubAdminCourt | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const impact = useCourtImpactQuery(clubId, deactivating?.id ?? null);

  const courts = courtsQ.data ?? [];
  const clubSports = (profileQ.data?.sports.length ? profileQ.data.sports : ['PADEL']) as Sport[];
  const currency = profileQ.data?.currency ?? context.club.currency;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= courts.length || from === to) return;
    reorder.mutate(moveItem(courts, from, to).map((c) => c.id));
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, to);
    setDragFrom(null);
  };

  const submit = async (values: CourtFormValues) => {
    const court = editing === 'new' ? null : editing;
    await upsert.mutateAsync({ courtId: court?.id ?? null, body: values });
    toast.success(court ? t('common.saved') : t('club.courts.added', { name: values.name }));
  };

  const setActive = async (court: ClubAdminCourt, isActive: boolean) => {
    try {
      await upsert.mutateAsync({ courtId: court.id, body: { isActive } });
      toast.success(isActive ? t('club.courts.reactivated', { name: court.name }) : t('club.courts.deactivated', { name: court.name }));
      setDeactivating(null);
      setEditing(null);
    } catch {
      // toasted by the mutation
    }
  };

  const meta = (c: ClubAdminCourt) =>
    [
      c.sport ? tApp(getSportConfig(c.sport as Sport).labelKey) : null,
      c.isIndoor ? t('club.courts.indoor') : t('club.courts.outdoor'),
      c.courtType,
      c.pricePerHourCents !== null ? t('club.courts.perHour', { price: formatCents(c.pricePerHourCents, currency, fmt.locale) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const impactText = () => {
    if (impact.isPending) return t('club.courts.impactLoading');
    if (impact.isError || !impact.data) return t('club.courts.impactUnknown');
    const { futureGames, futureHolds, nextBookingAt } = impact.data;
    if (futureGames === 0 && futureHolds === 0) return t('club.courts.impactNone');
    const parts = [
      futureGames > 0 ? t('club.courts.impactGames', { count: futureGames }) : null,
      futureHolds > 0 ? t('club.courts.impactHolds', { count: futureHolds }) : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <>
        <span className="block font-medium text-foreground">{t('club.courts.impactStay', { what: parts })}</span>
        {nextBookingAt ? <span className="mt-1 block">{t('club.courts.impactNext', { when: fmt.dateTime(nextBookingAt) })}</span> : null}
        <span className="mt-1 block">{t('club.courts.impactHint')}</span>
      </>
    );
  };

  const editingCourt = editing && editing !== 'new' ? editing : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-8 lg:p-6">
      <HeaderActions>
        <button type="button" className={buttonClass('primary', 'min-h-9 px-3')} onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">{t('club.courts.add')}</span>
        </button>
      </HeaderActions>

      {courtsQ.isPending ? (
        <SkeletonRows rows={4} />
      ) : courtsQ.isError ? (
        <ErrorState onRetry={() => void courtsQ.refetch()} />
      ) : courts.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t('club.courts.emptyTitle')}
          body={t('club.courts.emptyBody')}
          action={
            <button type="button" className={buttonClass('primary')} onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('club.courts.add')}
            </button>
          }
        />
      ) : (
        <>
          <p className="px-1 text-xs text-muted-foreground">{t('club.courts.orderHint')}</p>
          <RowList>
            <ul aria-label={t('club.pages.courts.title')}>
              {courts.map((c, i) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragEnd={() => setDragFrom(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, i)}
                  className={cx(
                    'flex items-center gap-2 border-b border-border px-2 py-2 last:border-b-0',
                    dragFrom === i && 'opacity-50',
                    !c.isActive && 'bg-ca-sunken/60'
                  )}
                >
                  <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground lg:block" aria-hidden />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-start hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    onClick={() => setEditing(c)}
                  >
                    <span
                      className={cx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        c.isActive ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300' : 'bg-ca-sunken text-muted-foreground'
                      )}
                    >
                      {c.isIndoor ? <Home className="h-[18px] w-[18px]" aria-hidden /> : <Sun className="h-[18px] w-[18px]" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cx('truncate text-sm font-medium', c.isActive ? 'text-foreground' : 'text-muted-foreground')}>{c.name}</span>
                        {!c.isActive ? (
                          <span className="shrink-0 rounded-full bg-ca-sunken px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('club.courts.inactive')}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{meta(c)}</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 lg:hidden">
                    <button
                      type="button"
                      className={cx(iconButtonClass, 'h-9 w-9')}
                      aria-label={t('club.courts.moveUp', { name: c.name })}
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, i - 1)}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cx(iconButtonClass, 'h-9 w-9')}
                      aria-label={t('club.courts.moveDown', { name: c.name })}
                      disabled={i === courts.length - 1 || reorder.isPending}
                      onClick={() => move(i, i + 1)}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </RowList>
        </>
      )}

      <ClubAdminCourtForm
        open={editing !== null}
        court={editingCourt}
        clubSports={clubSports}
        currency={currency}
        onClose={() => setEditing(null)}
        onSubmit={submit}
      >
        {editingCourt ? (
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium text-foreground">
              {editingCourt.isActive ? t('club.courts.switchOffTitle') : t('club.courts.switchOnTitle')}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {editingCourt.isActive ? t('club.courts.switchOffHint') : t('club.courts.switchOnHint')}
            </p>
            {editingCourt.isActive ? (
              <button type="button" className={buttonClass('secondary', 'text-destructive')} onClick={() => setDeactivating(editingCourt)}>
                <Power className="h-4 w-4" aria-hidden />
                {t('club.courts.switchOff')}
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass('secondary')}
                disabled={upsert.isPending}
                onClick={() => void setActive(editingCourt, true)}
              >
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />}
                {t('club.courts.switchOn')}
              </button>
            )}
          </div>
        ) : null}
      </ClubAdminCourtForm>

      <ConfirmSheet
        open={deactivating !== null}
        onOpenChange={(o) => {
          if (!o) setDeactivating(null);
        }}
        modalId="club-court-deactivate"
        nested
        title={t('club.courts.switchOffConfirm', { name: deactivating?.name ?? '' })}
        body={impactText()}
        confirmLabel={t('club.courts.switchOff')}
        busy={upsert.isPending}
        onConfirm={() => {
          if (deactivating) void setActive(deactivating, false);
        }}
      />
    </div>
  );
}
