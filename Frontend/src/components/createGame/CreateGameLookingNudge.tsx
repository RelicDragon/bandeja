import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useInviteLookingPool } from '@/components/playerInvite/useInviteLookingPool';
import type { InviteLookingMember, PlayerInviteLookingDraft } from '@/components/playerInvite/lookingTypes';
import { demandMemberAsBasicUser } from '@/components/playIntent/demandSlots';

type Props = {
  lookingDraft: PlayerInviteLookingDraft | null;
  /** Seats still free after the roster and pending invites. */
  freeSlots: number;
  excludeUserIds: string[];
  onInvite: (members: InviteLookingMember[]) => void;
};

const AVATARS_SHOWN = 3;

/**
 * Players step: "3 players are looking for this time · Invite them". Same
 * population as the invite modal's Looking tab (`POST /play-intents/invite-pool`
 * with the draft), surfaced inline so organizers see it without opening the
 * modal. Only members whose request fits this exact game and who are free to
 * be linked (OPEN, not in a proposal) are offered.
 */
export function CreateGameLookingNudge({ lookingDraft, freeSlots, excludeUserIds, onInvite }: Props) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const { members } = useInviteLookingPool({
    enabled: !!lookingDraft && freeSlots > 0,
    lookingDraft,
  });
  const offered = useMemo(() => {
    const excluded = new Set(excludeUserIds);
    return members.filter(
      (m) => m.matchesGame && m.status === 'OPEN' && !m.inProposal && !excluded.has(m.userId),
    );
  }, [excludeUserIds, members]);
  const toInvite = offered.slice(0, Math.max(0, freeSlots));
  const visible = !!lookingDraft && freeSlots > 0 && toInvite.length > 0;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="looking-nudge"
          data-testid="create-game-looking-nudge"
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2.5">
            <div className="flex shrink-0 -space-x-1.5" aria-hidden>
              {offered.slice(0, AVATARS_SHOWN).map((m) => (
                <PlayerAvatar
                  key={m.userId}
                  player={demandMemberAsBasicUser(m)}
                  subscribePresence={false}
                  fullHideName
                  inlineFace
                  inlineFacePlain
                  inlineFaceFlatStack
                  asDiv
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug text-foreground">
                {t('createGame.lookingNudgeTitle', { count: offered.length })}
              </div>
              <div className="text-xs leading-snug text-muted-foreground">
                {t('createGame.lookingNudgeHint')}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
              onClick={() => onInvite(toInvite)}
              data-testid="create-game-looking-nudge-invite"
            >
              <UserPlus className="h-4 w-4" />
              {t('createGame.lookingNudgeInvite', { count: toInvite.length })}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
