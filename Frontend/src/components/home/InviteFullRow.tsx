import { useTranslation } from 'react-i18next';
import { Hourglass, X } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import type { Invite } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  getClubTimezone,
  getDateLabelInClubTz,
  getGameTimeDisplay,
  getUserTimezone,
} from '@/utils/gameTimeDisplay';

interface InviteFullRowProps {
  invite: Invite;
  hiding: boolean;
  onOpen: () => void;
  onJoinWaitlist: () => void;
  onDecline: () => void;
  onHideAnimationEnd: () => void;
}

/**
 * A pending invite whose game has no free seat for the invitee. It stays in the inbox as
 * one quiet line instead of disappearing, does not badge the header bell, and turns back
 * into a full invite card when a seat opens (the server re-sends the invite then).
 * "Join waitlist" is the normal accept: the server queues the invitee while the game is full.
 */
export function InviteFullRow({
  invite,
  hiding,
  onOpen,
  onJoinWaitlist,
  onDecline,
  onHideAnimationEnd,
}: InviteFullRowProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const game = invite.game;
  const senderName = [invite.sender.firstName, invite.sender.lastName].filter(Boolean).join(' ');

  let when: string | null = null;
  // The inbox game select omits `timeIsSet`; only an explicit `false` means "no time yet".
  if (game?.startTime && game.timeIsSet !== false) {
    const displaySettings = resolveDisplaySettings(user ?? null);
    const day = getDateLabelInClubTz(
      game.startTime,
      getClubTimezone(game) ?? getUserTimezone(),
      displaySettings,
      t,
      { compactWeekday: true },
    );
    const time = getGameTimeDisplay({
      game,
      displaySettings,
      startTime: game.startTime,
      endTime: game.endTime,
      kind: 'time',
      t,
    }).primaryText;
    when = [day, time].filter(Boolean).join(', ');
  }
  const what = game?.name?.trim() || (game?.entityType ? t(`games.entityTypes.${game.entityType}`) : null);
  // The avatar already names the sender; time leads because names are long and truncate.
  const summary = [when, what].filter(Boolean).join(' · ');

  return (
    <div
      onAnimationEnd={() => hiding && onHideAnimationEnd()}
      className={`flex w-full min-w-0 items-center gap-1 rounded-xl border border-gray-200/80 bg-white py-2 pe-2 ps-3 transition-all duration-300 dark:border-gray-700/80 dark:bg-gray-800 ${
        hiding ? 'animate-[fadeOutUp_0.3s_ease-out_forwards] opacity-0 -translate-y-4' : 'opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-start active:opacity-70"
      >
        <span className="shrink-0 opacity-80" title={senderName || undefined}>
          <PlayerAvatar player={invite.sender} extrasmall fullHideName showName={false} asDiv />
        </span>
        <span className="block min-w-0 flex-1">
          <span className="sr-only">{senderName} · </span>
          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{summary}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Hourglass size={12} className="shrink-0" aria-hidden />
            <span className="truncate">{t('invites.fullForNow', { defaultValue: 'Full right now' })}</span>
          </span>
          <span className="block text-[11px] leading-snug text-gray-500 line-clamp-2 dark:text-gray-400">
            {t('invites.fullForNowHint', { defaultValue: "We'll tell you when a spot opens" })}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onJoinWaitlist}
        className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
      >
        {t('invites.joinWaitlist', { defaultValue: 'Join waitlist' })}
      </button>
      <button
        type="button"
        onClick={onDecline}
        aria-label={t('invites.decline')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-95 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <X size={16} />
      </button>
    </div>
  );
}
