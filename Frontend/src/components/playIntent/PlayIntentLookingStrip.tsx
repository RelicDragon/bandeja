import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { StatusPulseDot } from '@/components/StatusPulseDot';
import type { BasicUser } from '@/types';

type StripMember = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar: string | null;
};

type Props = {
  proposal: boolean;
  whenLabel: string;
  emptyPool: boolean;
  othersCount: number;
  stripMembers: StripMember[];
  onOpenLobby: () => void;
  onOpenProposal: () => void;
  onConfirmStop: () => void;
};

export function PlayIntentLookingStrip({
  proposal,
  whenLabel,
  emptyPool,
  othersCount,
  stripMembers,
  onOpenLobby,
  onOpenProposal,
  onConfirmStop,
}: Props) {
  const { t } = useTranslation();
  const [confirmStop, setConfirmStop] = useState(false);
  const hasAvatarOverflow = othersCount > 3;
  const visibleStripMembers = stripMembers.slice(0, hasAvatarOverflow ? 2 : 3);
  const hiddenMembersCount = Math.max(0, othersCount - visibleStripMembers.length);

  useEffect(() => {
    setConfirmStop(false);
  }, [proposal, whenLabel]);

  return (
    <AnimatedMount className="mb-3">
      <div
        className={`relative flex items-start gap-2 overflow-hidden rounded-xl border px-2.5 py-2 ${
          proposal ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-border/60 bg-muted/40'
        }`}
        data-testid="play-intent-status"
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          onClick={() => {
            if (confirmStop) return;
            if (proposal) onOpenProposal();
            else onOpenLobby();
          }}
          data-testid={proposal ? 'play-intent-open-proposal' : 'play-intent-open-lobby'}
          tabIndex={confirmStop ? -1 : 0}
          aria-hidden={confirmStop}
        >
          <StatusPulseDot tone="emerald" className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="whitespace-normal break-words text-sm font-medium leading-snug text-foreground">
              {proposal ? t('playIntent.proposalReady') : whenLabel || t('playIntent.looking')}
            </div>
            {!proposal && (
              <div className="whitespace-normal break-words text-xs leading-snug text-muted-foreground">
                {emptyPool
                  ? t('playIntent.emptyPool')
                  : t('playIntent.othersLooking', { count: othersCount })}
              </div>
            )}
          </div>
          {!proposal && stripMembers.length > 0 && (
            <div className="mt-0.5 flex shrink-0 -space-x-1.5" aria-hidden>
              {visibleStripMembers.map((member) => {
                const player: BasicUser = {
                  id: member.userId,
                  firstName: member.firstName ?? undefined,
                  lastName: member.lastName ?? undefined,
                  avatar: member.avatar,
                  level: 0,
                  socialLevel: 0,
                  gender: 'PREFER_NOT_TO_SAY',
                  approvedLevel: false,
                  isTrainer: false,
                };
                return (
                  <PlayerAvatar
                    key={member.userId}
                    player={player}
                    subscribePresence={false}
                    fullHideName
                    inlineFace
                    inlineFacePlain
                    inlineFaceFlatStack
                    asDiv
                  />
                );
              })}
              {hasAvatarOverflow && (
                <span className="relative z-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-background bg-muted text-[9px] font-semibold leading-none text-muted-foreground">
                  {hiddenMembersCount}+
                </span>
              )}
            </div>
          )}
        </button>

        <div className="relative mt-[-2px] h-8 w-8 shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {!confirmStop && (
              <motion.button
                key="stop-x"
                type="button"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-label={t('playIntent.stopLookingAria')}
                data-testid="play-intent-stop"
                onClick={() => setConfirmStop(true)}
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {confirmStop && (
            <motion.div
              key="stop-confirm"
              className="absolute inset-0 z-10 flex items-stretch gap-2 p-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="absolute inset-0 rounded-[0.65rem] bg-background/85 backdrop-blur-md dark:bg-gray-950/85"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.button
                type="button"
                data-testid="play-intent-stop-cancel"
                onClick={() => setConfirmStop(false)}
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.22, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-[1] flex min-w-0 flex-1 items-center justify-center rounded-lg border border-border/80 bg-muted/90 px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                {t('common.cancel')}
              </motion.button>
              <motion.button
                type="button"
                data-testid="play-intent-stop-confirm"
                onClick={() => {
                  setConfirmStop(false);
                  onConfirmStop();
                }}
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.22, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-[1] flex min-w-0 flex-[1.35] items-center justify-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white shadow-md shadow-rose-600/25 transition-colors hover:bg-rose-500"
              >
                {t('playIntent.dontWantToPlay')}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedMount>
  );
}
