export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ConsoleButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:enabled:active:scale-100';

const BUTTON_VARIANT: Record<ConsoleButtonVariant, string> = {
  primary: 'bg-primary-600 text-white enabled:hover:bg-primary-700 dark:bg-primary-500 dark:text-gray-950 dark:enabled:hover:bg-primary-400',
  secondary: 'border border-border bg-ca-surface text-foreground enabled:hover:bg-muted',
  ghost: 'text-foreground enabled:hover:bg-muted',
  danger: 'bg-destructive text-white enabled:hover:opacity-90',
};

export function buttonClass(variant: ConsoleButtonVariant = 'secondary', extra?: string): string {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], extra);
}

export const iconButtonClass =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-40';
