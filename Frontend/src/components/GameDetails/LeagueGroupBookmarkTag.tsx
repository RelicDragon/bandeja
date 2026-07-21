import { getLeagueGroupColor } from '@/utils/leagueGroupColors';

interface LeagueGroupBookmarkTagProps {
  name: string;
  color?: string | null;
}

/** Flush bottom-left ribbon; sits on card borders. */
export function LeagueGroupBookmarkTag({ name, color }: LeagueGroupBookmarkTagProps) {
  const groupColor = getLeagueGroupColor(color);
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 z-0 flex max-w-[42%] items-stretch"
      aria-hidden
    >
      <div
        className="truncate py-1.5 pl-2.5 pr-3 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
        style={{
          backgroundColor: groupColor,
          borderTopRightRadius: '0.375rem',
          clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%)',
        }}
        title={name}
      >
        {name}
      </div>
    </div>
  );
}
