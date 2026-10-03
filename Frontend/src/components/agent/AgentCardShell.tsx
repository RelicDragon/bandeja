import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { AgentCardTone } from '@/features/agent/agentToolCards';

const AGENT_CARD_TONE_PILL: Record<AgentCardTone, string> = {
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  bad: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
};

export function AgentCardPill({ tone, children }: { tone: AgentCardTone; children: ReactNode }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${AGENT_CARD_TONE_PILL[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Frame of a rich result card: icon tile, title / subtitle, a pill, then the body. With a
 * `path` the header row opens it; the body stays plain so it can scroll sideways on touch.
 */
export function AgentCardShell({
  icon,
  iconClassName,
  title,
  subtitle,
  pill,
  path,
  children,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  subtitle?: string | null;
  pill?: ReactNode;
  path?: string | null;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const header = (
    <>
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
            {title}
          </span>
          {pill}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
            {subtitle}
          </div>
        ) : null}
      </div>
      {path ? <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden /> : null}
    </>
  );
  const row = 'flex w-full min-w-0 items-center gap-3 px-3 pb-2 pt-2.5 text-start';
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {path ? (
        <button
          type="button"
          onClick={() => navigate(path)}
          className={`${row} transition-colors hover:bg-gray-50 active:bg-gray-50 dark:hover:bg-gray-700/60 dark:active:bg-gray-700/60`}
        >
          {header}
        </button>
      ) : (
        <div className={row}>{header}</div>
      )}
      {children ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}
