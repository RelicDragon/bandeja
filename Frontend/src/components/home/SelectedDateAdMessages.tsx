import { format } from 'date-fns';
import { useAdCalendarTags } from '@/hooks/useAdCalendarTags';

interface SelectedDateAdMessagesProps {
  date: Date | null;
}

/** Localized campaign details shown only after selecting a tagged calendar day. */
export function SelectedDateAdMessages({ date }: SelectedDateAdMessagesProps) {
  const { getTagsForDay } = useAdCalendarTags();
  if (!date) return null;

  const tags = getTagsForDay(format(date, 'yyyy-MM-dd'))
    .filter((tag) => Boolean(tag.message));
  if (tags.length === 0) return null;

  return (
    <div
      data-selected-date-ad-messages
      className="mx-auto mb-3 max-w-md space-y-2 px-1"
    >
      {tags.map((tag) => (
        <aside
          key={tag.campaignId}
          role="note"
          className="rounded-2xl border border-gray-200/80 border-s-2 bg-white/95 px-3.5 py-3 shadow-sm dark:border-gray-700/80 dark:bg-gray-900/85"
          style={{ borderInlineStartColor: tag.color }}
        >
          <p
            data-selected-date-ad-label
            className="text-[10px] font-bold uppercase leading-none tracking-[0.16em]"
            style={{ color: tag.color }}
          >
            {tag.label}
          </p>
          <p dir="auto" className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            {tag.message}
          </p>
        </aside>
      ))}
    </div>
  );
}
