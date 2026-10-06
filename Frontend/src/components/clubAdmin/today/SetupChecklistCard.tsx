import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { SETUP_STEPS } from './attentionModel';
import { cx } from '../console/classes';


/** Shown only while the club setup has gaps and the role can fix at least one. */
export function SetupChecklistCard() {
  const { t } = useTranslation('clubAdmin');
  const { context, clubId, can } = useClubConsole();
  const steps = SETUP_STEPS.filter((s) => can(s.capability));
  const done = steps.filter((s) => context.setup[s.key]).length;
  if (steps.length === 0 || done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <section className="rounded-2xl border border-border bg-ca-surface p-4" aria-labelledby="ca-setup-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="ca-setup-title" className="text-[15px] font-semibold text-foreground">
          {t('setup.title')}
        </h2>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {t('setup.progress', { done, total: steps.length })}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ca-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('setup.title')}>
        <div className="h-full rounded-full bg-primary-600 transition-[width] duration-200 dark:bg-primary-400" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-0.5">
        {steps.map((s) => {
          const ok = context.setup[s.key];
          return (
            <li key={s.key}>
              <Link
                to={`${consoleBase(clubId)}/club/${s.page}`}
                className="flex items-center gap-3 rounded-xl px-1.5 py-2 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span
                  className={cx(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    ok ? 'border-transparent bg-ca-ok-bg text-ca-ok' : 'border-border text-transparent'
                  )}
                  aria-hidden
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className={cx('flex-1 text-sm', ok ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {t(`setup.steps.${s.key}`)}
                  <span className="sr-only">{ok ? ` — ${t('setup.done')}` : ''}</span>
                </span>
                {!ok ? <ChevronRight className="h-4 w-4 text-muted-foreground rtl:-scale-x-100" aria-hidden /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
