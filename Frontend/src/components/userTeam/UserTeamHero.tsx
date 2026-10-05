import { useState, type ReactNode } from 'react';
import { Check, Loader2, PenLine } from 'lucide-react';
import type { UserTeam } from '@/types';
import { userTeamWashStyle } from '@/utils/userTeamColor';

export type HeroFieldStatus = 'idle' | 'saving' | 'saved' | 'error';

type HeroProps = {
  team: UserTeam;
  /** The team picture (owner: upload + cut dial; others: plain `TeamAvatar`). */
  avatar: ReactNode;
  /** Name + status, static or editable. */
  title: ReactNode;
  /** The duo row. */
  children: ReactNode;
};

/**
 * The top of `/user-team/:id`: an ambient wash in the team's colour
 * (`UserTeam.color`, default = primary — a team photo does not change it),
 * the picture, the name and the two seats.
 */
export function UserTeamHero({ team, avatar, title, children }: HeroProps) {
  return (
    <section
      data-testid="user-team-hero"
      className="relative isolate overflow-hidden rounded-[2rem] bg-[var(--ui-surface)] ring-1 ring-black/[0.04] shadow-[0_24px_60px_-40px_rgba(15,23,42,0.5)] dark:ring-white/[0.06]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 [mask-image:linear-gradient(to_bottom,black_35%,transparent)] dark:opacity-80"
        style={userTeamWashStyle(team.color)}
        aria-hidden
      />

      <div className="flex flex-col items-center px-4 pb-6 pt-4">
        <div className="drop-shadow-[0_18px_28px_rgba(15,23,42,0.22)]">{avatar}</div>
        <div className="mt-1 w-full">{title}</div>
        <div className="mt-5 w-full">{children}</div>
      </div>
    </section>
  );
}

/** An input cannot wrap, so long names step the size down instead of clipping. */
function titleSize(text: string): string {
  const n = text.trim().length;
  if (n > 20) return 'text-xl';
  if (n > 13) return 'text-2xl';
  return 'text-[1.75rem]';
}

export function UserTeamStaticTitle({ name, status }: { name: string; status?: string | null }) {
  return (
    <div className="px-2 text-center">
      <h1 className={`${titleSize(name)} font-bold leading-tight tracking-[-0.02em] text-zinc-900 [text-wrap:balance] dark:text-white`}>
        {name}
      </h1>
      {status?.trim() ? (
        <p className="mt-1 text-sm text-zinc-500 [text-wrap:balance] dark:text-zinc-400">{status.trim()}</p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  variant: 'title' | 'status';
  status: HeroFieldStatus;
  error?: string;
  maxLength?: number;
};

/**
 * Inline, autosaving text field styled as the text it edits. Enter or Done
 * just blurs: saving is already debounced by the page.
 */
export function UserTeamHeroField({
  value,
  onChange,
  ariaLabel,
  placeholder,
  variant,
  status,
  error,
  maxLength,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const isTitle = variant === 'title';
  const indicator =
    status === 'saving' ? (
      <Loader2 size={isTitle ? 16 : 14} className="animate-spin text-primary-600 dark:text-primary-400" aria-hidden />
    ) : status === 'saved' ? (
      <Check size={isTitle ? 16 : 14} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
    ) : !focused ? (
      <PenLine size={isTitle ? 15 : 13} className="text-zinc-400 dark:text-zinc-500" aria-hidden />
    ) : null;

  return (
    <div className={isTitle ? '' : 'mx-auto mt-0.5 max-w-[18rem]'}>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          maxLength={maxLength}
          enterKeyHint="done"
          className={`w-full rounded-2xl bg-transparent text-center outline-none ring-inset transition-[background-color,box-shadow] duration-200 placeholder:text-zinc-400 hover:bg-zinc-900/[0.03] focus:bg-zinc-900/[0.04] focus:ring-2 dark:hover:bg-white/[0.04] dark:focus:bg-white/[0.06] dark:placeholder:text-zinc-500 ${
            error ? 'ring-2 ring-red-500/50 focus:ring-red-500/60' : 'focus:ring-primary-500/35'
          } ${
            isTitle
              ? `px-9 py-1 font-bold leading-tight tracking-[-0.02em] text-zinc-900 dark:text-white ${titleSize(value)}`
              : 'px-8 py-1.5 text-sm text-zinc-500 dark:text-zinc-400'
          }`}
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">{indicator}</span>
      </div>
      {error ? (
        <p className="mt-1 text-center text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : focused && maxLength ? (
        <p className="mt-1 text-center text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
          {value.length}/{maxLength}
        </p>
      ) : null}
    </div>
  );
}
