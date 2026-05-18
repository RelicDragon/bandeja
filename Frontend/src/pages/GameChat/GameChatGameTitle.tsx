import type { LeagueGameHeaderParts, StructuredGameHeaderParts } from '@/utils/getGameHeaderTitle';

interface GameChatGameTitleProps {
  parts: StructuredGameHeaderParts;
}

export function GameChatGameTitlePrimary({ parts }: GameChatGameTitleProps) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
      <span className="truncate text-[13px] font-semibold tracking-tight text-blue-600 dark:text-blue-400">
        {parts.leagueName}
      </span>
      {parts.seasonName ? (
        <span className="truncate text-[12px] font-medium text-purple-600 dark:text-purple-400">
          {parts.seasonName}
        </span>
      ) : null}
    </span>
  );
}

export function GameChatGameTitleMeta({ parts }: { parts: LeagueGameHeaderParts }) {
  return (
    <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
      {parts.groupName ? (
        <span
          className="max-w-[min(100%,12rem)] truncate rounded px-1.5 py-px text-[10px] font-semibold leading-none text-white"
          style={{ backgroundColor: parts.groupColor || '#6b7280' }}
        >
          {parts.groupName}
        </span>
      ) : null}
      <span className="shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {parts.roundLabel}
      </span>
    </span>
  );
}

export function GameChatGameTitle({ parts }: GameChatGameTitleProps) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
      <GameChatGameTitlePrimary parts={parts} />
      {parts.kind === 'league' ? <GameChatGameTitleMeta parts={parts} /> : null}
    </span>
  );
}
