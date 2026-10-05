import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { BasicUser } from '@/types';

type Props = {
  owner: BasicUser;
  partner: BasicUser | null;
  viewerId: string;
  /** The partner was invited and has not answered yet. */
  partnerPending: boolean;
  /** Owner with a free seat: the second slot becomes the invite button. */
  onInvite?: () => void;
  disabled?: boolean;
};

/**
 * The two seats of a pair, joined by an ampersand. Member actions (remove,
 * cancel, leave) live in the page's Manage list rather than as badges on the
 * faces, so a stray tap on a face never starts a removal.
 *
 * Pending state is a dot + caption, never a ring: `PlayerAvatar` owns the ring
 * layer (frames, online, favourite, trainer).
 */
export function UserTeamDuo({ owner, partner, viewerId, partnerPending, onInvite, disabled }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-center gap-1" data-testid="user-team-duo">
      <div className="flex w-20 shrink-0 flex-col items-center">
        <PlayerAvatar player={owner} isCurrentUser={owner.id === viewerId} role="OWNER" smallLayout />
      </div>

      <div className="flex h-12 w-14 shrink-0 items-center" aria-hidden>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-300 dark:to-zinc-600" />
        <span className="mx-1 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-[13px] font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700">
          &amp;
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-300 dark:to-zinc-600" />
      </div>

      <div className="flex w-20 shrink-0 flex-col items-center">
        {partner ? (
          <>
            <div className={partnerPending ? 'opacity-70' : undefined}>
              <PlayerAvatar player={partner} isCurrentUser={partner.id === viewerId} role="PLAYER" smallLayout />
            </div>
            {partnerPending ? (
              <span className="mt-1 inline-flex items-center gap-1 text-center text-[10px] font-semibold leading-tight text-amber-700 dark:text-amber-300">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" aria-hidden />
                {t('teams.invitedAwaitingReply')}
              </span>
            ) : null}
          </>
        ) : onInvite ? (
          <button
            type="button"
            onClick={onInvite}
            disabled={disabled}
            className={`group flex flex-col items-center gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 ${pressScaleGuard}`}
            aria-label={t('teams.inviteTeammate')}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-primary-400/80 bg-primary-50 text-primary-600 transition-[background-color,transform] duration-200 group-hover:bg-primary-100 group-active:scale-95 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-400">
              <Plus size={22} strokeWidth={2.25} aria-hidden />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-primary-700 dark:text-primary-300">
              {t('teams.inviteTeammate')}
            </span>
          </button>
        ) : (
          <PlayerAvatar player={null} smallLayout />
        )}
      </div>
    </div>
  );
}
