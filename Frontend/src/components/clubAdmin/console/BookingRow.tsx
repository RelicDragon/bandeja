import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BookingItem } from '@shared/clubAdmin/contract';
import { BillingChip } from './controls';
import { VISUAL_CLASS, bookingVisual, useBookingText } from './bookingText';
import type { ConsoleFormat } from './format';
import { cx } from './classes';

/** One booking as a list row: time · kind swatch · title · court + detail · billing chip. */
export function BookingRow({
  item,
  fmt,
  to,
  trailing,
  nowMs,
}: {
  item: BookingItem;
  fmt: ConsoleFormat;
  to?: string;
  trailing?: ReactNode;
  nowMs?: number;
}) {
  const { t } = useTranslation('clubAdmin');
  const text = useBookingText();
  const visual = bookingVisual(item);
  const live = nowMs !== undefined && Date.parse(item.startTime) <= nowMs && Date.parse(item.endTime) > nowMs;
  const title = text.title(item);
  const court = item.courtName ?? (item.courtId ? t('common.court') : t('schedule.unassigned'));
  const body = (
    <>
      <div className="w-[4.25rem] shrink-0 text-start tabular-nums">
        <div className="text-[15px] font-semibold leading-tight text-foreground">{fmt.time(item.startTime)}</div>
        <div className="text-xs text-muted-foreground">{fmt.time(item.endTime)}</div>
      </div>
      <span className={cx('h-10 w-1.5 shrink-0 rounded-full', VISUAL_CLASS[visual])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-foreground">{title}</p>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ca-ok-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ca-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-ca-ok motion-safe:animate-pulse" aria-hidden />
              {t('common.now')}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {court} · {text.detail(item)}
        </p>
      </div>
      <BillingChip billing={item.billing} />
      {trailing}
    </>
  );
  const cls =
    'flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none';
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
