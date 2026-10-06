/**
 * Booking detail — the body of the mobile sheet and of the desktop side rail.
 * Game: open game, message host, cancel & notify, release court. Hold: edit/move, delete (one or
 * this-and-following for a series). Club-system bookings are read-only. Past bookings are view-only.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarX2, ExternalLink, MessageCircle, Pencil, Phone, Repeat, Trash2, Unlink } from 'lucide-react';
import type { ScheduleSlotV2 } from '@shared/clubAdmin/contract';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BasicUser } from '@/types';
import { BillingChip } from '../console/controls';
import { VISUAL_CLASS, bookingVisual, personName, useBookingText } from '../console/bookingText';
import type { ConsoleFormat } from '../console/format';
import { buttonClass, cx } from '../console/classes';
import { BookingPaymentSection } from '../billing/BookingPayment';
import { chargeSourceOf } from '../billing/billingModel';
import type { HoldDeleteScope } from '@shared/clubAdmin/contract';

export interface BookingDetailActions {
  onOpenGame: (gameId: string) => void;
  onMessageHost: (hostId: string) => void;
  onCourtAction: (mode: 'cancel' | 'clear') => void;
  onEditHold: () => void;
  onDeleteHold: (scope: HoldDeleteScope) => Promise<void>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function BookingDetail({
  slot,
  courtName,
  fmt,
  nowMs,
  canEdit,
  actions,
  deleting,
  nestedSheets,
}: {
  slot: ScheduleSlotV2;
  courtName: string;
  fmt: ConsoleFormat;
  nowMs: number;
  canEdit: boolean;
  actions: BookingDetailActions;
  deleting?: boolean;
  /** Rendered inside a sheet (phones): the payment sheets open nested. */
  nestedSheets?: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  const text = useBookingText();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const visual = bookingVisual(slot);
  const past = Date.parse(slot.endTime) <= nowMs;
  const editable = canEdit && !past;
  // Only games and holds have schedule-edit actions; the note explains why those are missing.
  const pastLocked = canEdit && past && (slot.type === 'game' || slot.type === 'game_court' || slot.type === 'hold');
  const chargeSource = chargeSourceOf(slot);
  const billing = 'billing' in slot ? slot.billing : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={cx('mt-1 h-9 w-2 shrink-0 rounded-full', VISUAL_CLASS[visual])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`schedule.kindLabel.${visual}`)}</p>
          <p className="truncate text-lg font-semibold text-foreground">{text.title(slot)}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {fmt.timeRange(slot.startTime, slot.endTime)} · {courtName}
          </p>
        </div>
        {'billing' in slot ? <BillingChip billing={slot.billing} /> : null}
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border px-3">
        {slot.type === 'game' || slot.type === 'game_court' ? (
          <>
            <Row label={t('detail.host')}>
              <span className="inline-flex items-center gap-2">
                <PlayerAvatar
                  player={
                    {
                      id: slot.host.id,
                      firstName: slot.host.firstName ?? undefined,
                      lastName: slot.host.lastName ?? undefined,
                      avatar: slot.host.avatar,
                      level: 0,
                      socialLevel: 0,
                    } as BasicUser
                  }
                  inlineFace
                  inlineFaceSize="sm"
                  subscribePresence={false}
                />
                {personName(slot.host) || '—'}
              </span>
            </Row>
            <Row label={t('detail.players')}>{text.detail(slot)}</Row>
          </>
        ) : null}
        {slot.type === 'hold' ? (
          <>
            <Row label={t('detail.reason')}>{t(`holdLabel.${slot.label}`)}</Row>
            {slot.customerName ? <Row label={t('detail.customer')}>{slot.customerName}</Row> : null}
            {slot.customerPhone ? (
              <Row label={t('detail.phone')}>
                <a href={`tel:${slot.customerPhone}`} className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400" dir="ltr">
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {slot.customerPhone}
                </a>
              </Row>
            ) : null}
            {slot.note ? <Row label={t('detail.note')}>{slot.note}</Row> : null}
            {slot.seriesId ? (
              <Row label={t('detail.series')}>
                <span className="inline-flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5" aria-hidden />
                  {t('detail.weekly')}
                </span>
              </Row>
            ) : null}
          </>
        ) : null}
        {slot.type === 'external' ? <Row label={t('detail.source')}>{t('kind.externalHint')}</Row> : null}
      </dl>

      {chargeSource && billing ? <BookingPaymentSection source={chargeSource} billing={billing} fmt={fmt} nested={nestedSheets} /> : null}

      <div className="grid gap-2">
        {slot.type === 'game' || slot.type === 'game_court' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonClass('secondary')} onClick={() => actions.onOpenGame(slot.gameId)}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t('detail.openGame')}
              </button>
              <button
                type="button"
                className={buttonClass('secondary')}
                onClick={() => actions.onMessageHost(slot.host.id)}
                disabled={!slot.host.id}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('detail.messageHost')}
              </button>
            </div>
            {editable ? (
              <div className="grid grid-cols-2 gap-2">
                {slot.courtId ? (
                  <button type="button" className={buttonClass('secondary')} onClick={() => actions.onCourtAction('clear')}>
                    <Unlink className="h-4 w-4" aria-hidden />
                    {t('detail.clearCourt')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={buttonClass('secondary', cx('text-destructive', !slot.courtId && 'col-span-2'))}
                  onClick={() => actions.onCourtAction('cancel')}
                >
                  <CalendarX2 className="h-4 w-4" aria-hidden />
                  {t('detail.cancelGame')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {slot.type === 'hold' && editable ? (
          confirmDelete ? (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-ca-danger-bg p-3" role="group" aria-label={t('detail.deleteHold')}>
              <p className="text-sm font-medium text-foreground">{t('detail.deleteConfirm')}</p>
              <div className={cx('grid gap-2', slot.seriesId ? 'grid-cols-1' : 'grid-cols-2')}>
                <button type="button" className={buttonClass('danger')} disabled={deleting} onClick={() => void actions.onDeleteHold('one')}>
                  {slot.seriesId ? t('detail.deleteOne') : t('common.delete')}
                </button>
                {slot.seriesId ? (
                  <button type="button" className={buttonClass('danger')} disabled={deleting} onClick={() => void actions.onDeleteHold('following')}>
                    {t('detail.deleteFollowing')}
                  </button>
                ) : null}
                <button type="button" className={buttonClass('ghost')} onClick={() => setConfirmDelete(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonClass('secondary')} onClick={actions.onEditHold}>
                <Pencil className="h-4 w-4" aria-hidden />
                {t('detail.editHold')}
              </button>
              <button type="button" className={buttonClass('secondary', 'text-destructive')} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('detail.deleteHold')}
              </button>
            </div>
          )
        ) : null}

        {pastLocked ? <p className="text-sm text-muted-foreground">{t('detail.pastReadOnly')}</p> : null}
      </div>
    </div>
  );
}
