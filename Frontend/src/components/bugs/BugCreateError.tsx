interface BugCreateErrorProps {
  message: string | null;
}

export function BugCreateError({ message }: BugCreateErrorProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="bug-create-error"
      className="mx-6 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400"
    >
      {message}
    </div>
  );
}
