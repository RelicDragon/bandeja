import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookingBillingSummary } from '@shared/clubAdmin/contract';
import { cx } from './classes';

// ---------------------------------------------------------------------------
// Segmented control (radiogroup, arrow keys move selection)
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'md',
}: {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = index;
    if (e.key === fwd || e.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (e.key === back || e.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('inline-flex rounded-xl bg-ca-sunken p-1', className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-lg font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 motion-reduce:transition-none',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              selected ? 'bg-ca-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter chips (toggle buttons in a horizontal rail)
// ---------------------------------------------------------------------------

export interface ChipOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function FilterChips<T extends string>({
  options,
  selected,
  onToggle,
  ariaLabel,
  className,
}: {
  options: Array<ChipOption<T>>;
  selected: readonly T[];
  onToggle: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx('ca-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5', className)}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={cx(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 motion-reduce:transition-none',
              on
                ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-gray-950'
                : 'border-border bg-ca-surface text-foreground hover:bg-muted'
            )}
          >
            {o.label}
            {typeof o.count === 'number' ? <span className="tabular-nums opacity-70">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing chip — Paid / Unpaid / Partial / Waived / Void
// ---------------------------------------------------------------------------

const BILLING_TONE: Record<string, string> = {
  PAID: 'bg-ca-ok-bg text-ca-ok',
  PARTIAL: 'bg-ca-warn-bg text-ca-warn',
  UNPAID: 'bg-ca-danger-bg text-destructive',
  WAIVED: 'bg-ca-sunken text-muted-foreground',
  VOID: 'bg-ca-sunken text-muted-foreground line-through',
};

export function BillingChip({ billing, className }: { billing: BookingBillingSummary | null | undefined; className?: string }) {
  const { t } = useTranslation('clubAdmin');
  if (!billing?.status) return null;
  return (
    <span
      className={cx(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide',
        BILLING_TONE[billing.status] ?? BILLING_TONE.WAIVED,
        className
      )}
    >
      {t(`billing.${billing.status}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form field
// ---------------------------------------------------------------------------

export const inputClass =
  'block w-full rounded-xl border border-border bg-ca-surface px-3.5 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';

export function Field({
  label,
  hint,
  htmlFor,
  children,
  error,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  error?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
