import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, MapPin } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAgentSend } from '@/features/agent/agentSendContext';
import {
  agentSlotBadge,
  buildBookSlotMessage,
  clubTimeZoneLabel,
  durationMinutes,
  formatClubDate,
  formatClubTimeRange,
  groupAgentSlotsByClub,
  type AgentSlotBadgeTone,
  type AgentSlotEntity,
  type AgentSlotGroup,
  type ClubTimeFormat,
} from '@/features/agent/agentBookingCards';

const BADGE_CLASS: Record<AgentSlotBadgeTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  neutral: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  muted: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

/**
 * Bookable slots from `find_available_slots`, grouped by club, times in the club's tz.
 * Tapping one sends "Book this slot …" with a hidden `[slot:<ref>]` token (docs/domains/agent.md).
 * Snapshot slots are not re-checked here: that needs the full club + provider session; the
 * `book_court` preview / client plan re-checks live before anything is booked.
 */
export const AgentSlotPicker = memo(function AgentSlotPicker({ slots }: { slots: AgentSlotEntity[] }) {
  const user = useAuthStore((s) => s.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const fmt: ClubTimeFormat = { locale: settings.locale, hour12: settings.hour12 };
  const groups = useMemo(() => groupAgentSlotsByClub(slots), [slots]);
  const [picked, setPicked] = useState<string | null>(null);

  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <SlotGroup key={group.clubId} group={group} fmt={fmt} picked={picked} onPicked={setPicked} />
      ))}
    </div>
  );
});

function SlotGroup({
  group,
  fmt,
  picked,
  onPicked,
}: {
  group: AgentSlotGroup;
  fmt: ClubTimeFormat;
  picked: string | null;
  onPicked: (slotRef: string) => void;
}) {
  const { t } = useTranslation();
  const tzLabel = clubTimeZoneLabel(group.slots[0].start, group.timeZone, fmt.locale);
  const byDate: { date: string; slots: AgentSlotEntity[] }[] = [];
  for (const slot of group.slots) {
    const date = formatClubDate(slot.start, slot.timeZone, fmt.locale);
    const last = byDate[byDate.length - 1];
    if (last && last.date === date) last.slots.push(slot);
    else byDate.push({ date, slots: [slot] });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex min-w-0 items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
        <MapPin size={16} className="flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
          {group.clubName}
        </span>
        {tzLabel ? (
          <span className="flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
            {t('agent.slot.clubTime', { tz: tzLabel })}
          </span>
        ) : null}
      </div>
      {byDate.map(({ date, slots }) => (
        <div key={date}>
          <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {date}
          </div>
          <ul className="flex flex-col py-1">
            {slots.map((slot) => (
              <li key={slot.slotRef}>
                <SlotRow slot={slot} fmt={fmt} picked={picked === slot.slotRef} onPicked={onPicked} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SlotRow({
  slot,
  fmt,
  picked,
  onPicked,
}: {
  slot: AgentSlotEntity;
  fmt: ClubTimeFormat;
  picked: boolean;
  onPicked: (slotRef: string) => void;
}) {
  const { t } = useTranslation();
  const sender = useAgentSend();
  const badge = agentSlotBadge(slot, fmt);
  const minutes = durationMinutes(slot.start, slot.end);
  const details = [minutes != null ? t('agent.slot.minutes', { minutes }) : null, slot.courtNames.join(', ')]
    .filter(Boolean)
    .join(' · ');
  const disabled = !sender || sender.disabled;

  const onClick = () => {
    if (!sender || sender.disabled) return;
    onPicked(slot.slotRef);
    sender.send(buildBookSlotMessage(t, slot, fmt));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t('agent.slot.pick', { time: formatClubTimeRange(slot.start, slot.end, slot.timeZone, fmt) })}
      className={`flex w-full min-w-0 items-center gap-2 px-3 py-2 text-start transition-colors enabled:hover:bg-gray-50 enabled:active:bg-gray-100 disabled:cursor-default dark:enabled:hover:bg-gray-700/60 dark:enabled:active:bg-gray-700 ${
        picked ? 'bg-primary-50 dark:bg-primary-900/30' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
          {formatClubTimeRange(slot.start, slot.end, slot.timeZone, fmt)}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
          {details}
        </div>
        <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${BADGE_CLASS[badge.tone]}`}>
          {t(badge.key, badge.params)}
        </span>
      </div>
      {picked ? (
        <Check size={18} className="flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
      ) : disabled ? null : (
        <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
      )}
    </button>
  );
}
