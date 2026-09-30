import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAgentSend } from '@/features/agent/agentSendContext';
import {
  agentBookingCancelMode,
  agentProviderName,
  buildCancelBookingMessage,
  clubTimeZoneLabel,
  formatClubDate,
  formatClubTimeRange,
  type AgentBookingEntity,
  type ClubTimeFormat,
} from '@/features/agent/agentBookingCards';

const STATE_CLASS: Record<AgentBookingEntity['state'], string> = {
  CONFIRMED: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PAST: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  UNKNOWN: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

/**
 * A provider court booking. Cancel sends "Cancel booking …" with a hidden `[booking:<ref>]`
 * token, so the model proposes `cancel_booking` (confirmed on its own card). Providers without
 * a cancel API (Weltner, Nspadel) point at the club instead.
 */
export const AgentBookingCard = memo(function AgentBookingCard({ booking }: { booking: AgentBookingEntity }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sender = useAgentSend();
  const user = useAuthStore((s) => s.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const fmt: ClubTimeFormat = { locale: settings.locale, hour12: settings.hour12 };
  const [cancelSent, setCancelSent] = useState(false);

  const date = formatClubDate(booking.start, booking.timeZone, fmt.locale);
  const time = formatClubTimeRange(booking.start, booking.end, booking.timeZone, fmt);
  const tzLabel = clubTimeZoneLabel(booking.start, booking.timeZone, fmt.locale);
  const cancelMode = agentBookingCancelMode(booking);
  const cancelDisabled = !sender || sender.disabled || cancelSent;

  const onCancel = () => {
    if (!sender || sender.disabled || cancelSent) return;
    setCancelSent(true);
    sender.send(buildCancelBookingMessage(t, booking, fmt));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
          <CalendarCheck size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
              {booking.clubName}
            </span>
            <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATE_CLASS[booking.state]}`}>
              {t(`agent.booking.state.${booking.state}`)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            {[date, time, tzLabel].filter(Boolean).join(' · ')}
          </div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
            {[booking.courtNames.join(', '), agentProviderName(booking.provider)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {booking.linkedGameIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {booking.linkedGameIds.map((gameId, i) => (
            <button
              key={gameId}
              type="button"
              onClick={() => navigate(`/games/${gameId}`)}
              className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-primary-400 dark:hover:bg-gray-600"
            >
              {booking.linkedGameIds.length > 1
                ? t('agent.booking.linkedGameN', { n: i + 1 })
                : t('agent.booking.linkedGame')}
              <ChevronRight size={14} className="rtl:rotate-180" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      {cancelMode === 'cancel' ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelDisabled}
          className="self-start rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors enabled:hover:bg-red-50 enabled:active:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:enabled:hover:bg-red-950/40"
        >
          {t('agent.booking.cancel')}
        </button>
      ) : cancelMode === 'viaClub' ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{t('agent.booking.cancelViaClub')}</span>
          <button
            type="button"
            onClick={() => navigate(`/clubs/${booking.clubId}`)}
            className="inline-flex items-center gap-0.5 font-medium text-primary-600 dark:text-primary-400"
          >
            {t('agent.booking.openClub')}
            <ChevronRight size={14} className="rtl:rotate-180" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
});
