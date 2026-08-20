type InactiveRatingSectionRowProps = {
  title: string;
  hint: string;
};

export function InactiveRatingSectionRow({ title, hint }: InactiveRatingSectionRowProps) {
  return (
    <tr data-testid="leaderboard-inactive-section" className="pointer-events-none">
      <td colSpan={3} className="px-0 pb-1 pt-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            {title}
          </span>
          <span className="min-w-0 truncate text-[10px] text-gray-400 dark:text-gray-500">
            {hint}
          </span>
        </div>
      </td>
    </tr>
  );
}
