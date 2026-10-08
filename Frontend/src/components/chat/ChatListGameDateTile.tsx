import type { LucideIcon } from 'lucide-react';
import type { Game } from '@/types';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import type { TFunction } from 'i18next';
import { getGameChatListTileLabels } from '@/utils/chatListGameCardDisplay';
import type { ChatListGameTone } from './chatListGameTone';

const TONE_CLASS: Record<ChatListGameTone, string> = {
  playing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  invited: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  queue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  neutral: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  past: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

type Props = {
  game: Game;
  tone: ChatListGameTone;
  Icon: LucideIcon;
  displaySettings: ResolvedDisplaySettings;
  t: TFunction;
  size?: 'md' | 'lg';
};

/** Day over start time ("Sun 12" / "18:00"); the entity icon when no time is set. */
export function ChatListGameDateTile({ game, tone, Icon, displaySettings, t, size = 'md' }: Props) {
  const labels = getGameChatListTileLabels(game, displaySettings, t);
  const live = game.status === 'STARTED';
  const box = size === 'lg' ? 'h-[60px] w-[60px] rounded-[18px]' : 'h-12 w-[52px] rounded-[14px]';
  const timeText = displaySettings.hour12
    ? size === 'lg' ? 'text-xs' : 'text-[11px]'
    : size === 'lg' ? 'text-[17px]' : 'text-[15px]';

  return (
    <div
      className={`relative flex shrink-0 flex-col items-center justify-center leading-tight ${box} ${TONE_CLASS[tone]}`}
    >
      {live ? (
        <span className="absolute end-1.5 top-1.5 flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
      ) : null}
      {labels ? (
        <>
          <span className="w-full truncate px-0.5 text-center text-[10px] font-medium tracking-tight opacity-90">
            {live ? t('chat.list.live', { defaultValue: 'Live' }) : labels.dayLabel}
          </span>
          <span className={`font-semibold tabular-nums ${timeText}`}>{labels.timeLabel}</span>
        </>
      ) : (
        <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
      )}
    </div>
  );
}
