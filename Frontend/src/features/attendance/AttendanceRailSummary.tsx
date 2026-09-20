/**
 * PRD 346 — the mini avatar stack + "3/4" fraction on a Home / Find card.
 *
 * Purely visual, viewer's own games only. Deliberately has **no** urgency
 * treatment: no border colour change, no red, no "only 1 confirmed!" nudge. It
 * is a glance, not a prompt.
 */
import { memo } from 'react';
import type { AttendanceRailData } from './attendanceRailData';
import { useTranslation } from 'react-i18next';
import { attendanceDotStyle, formatFraction } from './attendanceVisuals';

export interface AttendanceRailSummaryProps {
  data: AttendanceRailData;
  locale: string;
}

const MAX_STACK = 4;

function AttendanceRailSummaryInner({ data, locale }: AttendanceRailSummaryProps) {
  const { t } = useTranslation();
  if (data.playingCount <= 0) return null;

  const players = data.players.slice(0, MAX_STACK);
  const ariaSummary = t('attendance.card.ariaSummary', {
    confirmed: data.confirmedCount,
    total: data.playingCount,
  });

  return (
    <div
      className="pointer-events-none flex items-center gap-1"
      role="img"
      aria-label={ariaSummary}
    >
      <div className="flex items-center">
        {players.map((player, index) => {
          const dot = attendanceDotStyle(player.state);
          return (
            <span
              key={player.userId}
              className="relative inline-block h-5 w-5 rounded-full ring-2 ring-white dark:ring-gray-900"
              style={{ marginInlineStart: index === 0 ? 0 : '-6px', zIndex: MAX_STACK - index }}
            >
              {player.avatarUrl ? (
                <img
                  src={player.avatarUrl}
                  alt=""
                  aria-hidden
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                >
                  {player.initial}
                </span>
              )}
              <span
                aria-hidden
                className={`absolute -bottom-0.5 inline-block h-2 w-2 rounded-full ring-1 ring-white dark:ring-gray-900 ${dot.className}`}
                style={{ insetInlineEnd: '-1px' }}
              />
            </span>
          );
        })}
      </div>
      <span className="text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400">
        {formatFraction(data.confirmedCount, data.playingCount, locale)}
      </span>
    </div>
  );
}

export const AttendanceRailSummary = memo(AttendanceRailSummaryInner);

