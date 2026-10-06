/**
 * Club admin console primitives. Semantic tokens only (`bg-background`, `bg-ca-surface`,
 * `text-muted-foreground`, `border-border`), logical spacing so `ar` mirrors, tabular figures.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buttonClass, cx } from './classes';
import { AlertTriangle, ChevronRight, CloudOff, Lock, RefreshCw, SearchX, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Section({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={cx('space-y-2.5', className)} aria-labelledby={headingId}>
      {title || action ? (
        <div className="flex min-h-7 items-center justify-between gap-3 px-1">
          {title ? (
            <h2 id={headingId} className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-border bg-ca-surface', className)}>{children}</div>;
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-0.5 rounded-md text-sm font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
    >
      {children}
      <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

export type KpiTone = 'neutral' | 'primary' | 'warn' | 'ok';

const KPI_VALUE_TONE: Record<KpiTone, string> = {
  neutral: 'text-foreground',
  primary: 'text-primary-700 dark:text-primary-300',
  warn: 'text-ca-warn',
  ok: 'text-ca-ok',
};

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-ca-surface p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <div className="ca-skeleton h-7 w-16" aria-hidden />
      ) : (
        <div className={cx('text-2xl font-semibold leading-tight tracking-tight tabular-nums', KPI_VALUE_TONE[tone])}>
          {value}
        </div>
      )}
      {hint && !loading ? <div className="truncate text-xs text-muted-foreground tabular-nums">{hint}</div> : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attention row
// ---------------------------------------------------------------------------

export type AttentionTone = 'warn' | 'danger' | 'info';

const ATTENTION_ICON_TONE: Record<AttentionTone, string> = {
  warn: 'bg-ca-warn-bg text-ca-warn',
  danger: 'bg-ca-danger-bg text-destructive',
  info: 'bg-primary-500/10 text-primary-600 dark:text-primary-300',
};

export function AttentionRow({
  icon: Icon,
  tone = 'warn',
  title,
  description,
  to,
  onClick,
}: {
  icon: LucideIcon;
  tone?: AttentionTone;
  title: ReactNode;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', ATTENTION_ICON_TONE[tone])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      {to || onClick ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden /> : null}
    </>
  );
  const cls =
    'flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Rows separated by hairlines inside one card. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('divide-y divide-border overflow-hidden rounded-2xl border border-border bg-ca-surface', className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon = SearchX,
  title,
  body,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14')}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ca-sunken text-muted-foreground">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {body ? <p className="mx-auto max-w-xs text-sm text-muted-foreground">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type ErrorKind = 'error' | 'offline' | 'forbidden' | 'notFound';

const ERROR_ICON: Record<ErrorKind, LucideIcon> = {
  error: AlertTriangle,
  offline: CloudOff,
  forbidden: Lock,
  notFound: SearchX,
};

export function ErrorState({
  kind = 'error',
  title,
  body,
  onRetry,
  action,
  compact,
}: {
  kind?: ErrorKind;
  title?: ReactNode;
  body?: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  return (
    <div role="alert">
      <EmptyState
        compact={compact}
        icon={ERROR_ICON[kind]}
        title={title ?? t(`states.${kind}.title`)}
        body={body ?? t(`states.${kind}.body`)}
        action={
          action ??
          (onRetry ? (
            <button type="button" className={buttonClass('secondary')} onClick={onRetry}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('common.retry')}
            </button>
          ) : null)
        }
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('ca-skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation('clubAdmin');
  return (
    <div className={cx('space-y-2', className)} role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-ca-surface p-3.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
