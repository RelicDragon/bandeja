import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Pencil, Trash2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { usePlayIntentMutations } from '@/hooks/usePlayIntent';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import type {
  DemandSlot,
  DemandSlots,
  MatchProposalSummary,
  MatchingLobbyGame,
  PlayIntent,
  PoolMember,
} from '@/api/playIntents';
import type { Sport } from '@/types';
import { PlayIntentComposePanel } from './PlayIntentComposeSheet';
import { CourtLobbyPanel } from './CourtLobbySheet';
import { DemandSlotsSection } from './DemandSlotsSection';
import { demandSlotCreateState, demandSlotIntentBody, demandSlotWhen } from './demandSlots';

type Mode = 'compose' | 'lobby';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode: Mode;
  cityId?: string | null;
  sport: Sport;
  todayKey?: string;
  timezone?: string;
  members: PoolMember[];
  overflow: number;
  partySize: number;
  availableCount: number;
  clusterProgress: number;
  intent?: PlayIntent | null;
  proposal?: MatchProposalSummary | null;
  matchingGames?: MatchingLobbyGame[];
  /** Open demand by day × part of day (`GET /play-intents/slots`). */
  demandSlots?: DemandSlots | null;
  onChanged?: () => void;
};

export function PlayIntentSheet({
  open,
  onOpenChange,
  initialMode,
  cityId,
  sport,
  todayKey,
  timezone,
  members,
  overflow,
  partySize,
  availableCount,
  clusterProgress,
  intent,
  proposal,
  matchingGames,
  demandSlots,
  onChanged,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { cancel, create } = usePlayIntentMutations(cityId, sport);
  const [joiningSlotKey, setJoiningSlotKey] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [submittedIntent, setSubmittedIntent] = useState<PlayIntent | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Register the sheet as a modal so Android hardware-back / iOS swipe-back
  // closes it directly instead of navigating away.
  useBackButtonModal(open, () => onOpenChange(false), 'play-intent-sheet');

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSubmittedIntent(null);
    setConfirmCancel(false);
  }, [initialMode, open]);

  const activeIntent = submittedIntent ?? intent;

  const cancelIntent = async () => {
    try {
      await cancel.mutateAsync(activeIntent?.id);
      setConfirmCancel(false);
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t));
    }
  };

  const slotsTodayKey = demandSlots?.todayKey ?? todayKey ?? '';
  const slotsTimezone = demandSlots?.cityTimezone ?? timezone;

  const createFromSlot = (slot: DemandSlot) => {
    if (!demandSlots || !slotsTimezone) return;
    const state = demandSlotCreateState({
      slot,
      partySize: demandSlots.partySize,
      sport: demandSlots.sport,
      timezone: slotsTimezone,
      todayKey: slotsTodayKey,
      viewerIntentId: demandSlots.viewerIntentId,
      viewerLevel: demandSlots.viewerLevel,
    });
    onOpenChange(false);
    navigate('/create-game', { state });
  };

  const joinSlot = async (slot: DemandSlot) => {
    if (!cityId || !demandSlots || joiningSlotKey) return;
    setJoiningSlotKey(slot.key);
    try {
      const next = await create.mutateAsync(demandSlotIntentBody(slot, cityId, demandSlots.sport));
      toast.success(
        t('playIntent.slotJoined', { when: demandSlotWhen(slot, slotsTodayKey, t, i18n.language) }),
      );
      setSubmittedIntent(next);
      setMode('lobby');
      onChanged?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t));
    } finally {
      setJoiningSlotKey(null);
    }
  };

  // Compose shows the slots only for a brand-new intent (editing keeps the
  // form in charge); the lobby shows them to everyone, joining only to spectators.
  const showSlots =
    !!demandSlots?.slots.length && (mode === 'lobby' || !activeIntent);
  const slotsSection = showSlots && demandSlots ? (
    <DemandSlotsSection
      className="mt-3"
      slots={demandSlots.slots}
      todayKey={slotsTodayKey}
      partySize={demandSlots.partySize}
      canJoin={!activeIntent}
      joiningKey={joiningSlotKey}
      onCreate={createFromSlot}
      onJoin={(slot) => void joinSlot(slot)}
    />
  ) : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-member-accent="emerald sky"
        className="max-h-[94dvh] overflow-hidden rounded-t-[32px] border-x border-t border-gray-200/80 bg-gray-50 text-gray-950 shadow-[0_-24px_70px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#0b111b] dark:text-white"
        accessibleTitle={t(
          mode === 'compose'
            ? 'playIntent.composeTitle'
            : 'playIntent.lobbyTitle',
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
      >
        <div
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-white/20"
          aria-hidden
        />
        <DrawerCloseButton
          ref={closeButtonRef}
          className="absolute right-4 top-3.5 z-20 bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/15"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'lobby' && activeIntent && (
            <div className="relative z-10 mx-4 mt-3 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            {reduceMotion ? (
              confirmCancel ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-10 flex-1 rounded-xl bg-gray-100 px-3 text-sm font-semibold text-gray-800 dark:bg-white/10 dark:text-white"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancel.isPending}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="flex h-10 flex-[1.35] items-center justify-center rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white"
                    onClick={() => void cancelIntent()}
                    disabled={cancel.isPending}
                    data-testid="play-intent-drawer-cancel-confirm"
                  >
                    {cancel.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('playIntent.dontWantToPlay')
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white"
                    onClick={() => setMode('compose')}
                    data-testid="play-intent-change"
                  >
                    <Pencil className="h-4 w-4" />
                    {t('playIntent.changeIntent')}
                  </button>
                  <button
                    type="button"
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                    onClick={() => setConfirmCancel(true)}
                    data-testid="play-intent-drawer-cancel"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('playIntent.cancelIntent')}
                  </button>
                </div>
              )
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {confirmCancel ? (
                  <motion.div
                    key="confirm"
                    className="flex gap-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <button
                      type="button"
                      className="h-10 flex-1 rounded-xl bg-gray-100 px-3 text-sm font-semibold text-gray-800 dark:bg-white/10 dark:text-white"
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancel.isPending}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 flex-[1.35] items-center justify-center rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white"
                      onClick={() => void cancelIntent()}
                      disabled={cancel.isPending}
                      data-testid="play-intent-drawer-cancel-confirm"
                    >
                      {cancel.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('playIntent.dontWantToPlay')
                      )}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="actions"
                    className="flex gap-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <button
                      type="button"
                      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white"
                      onClick={() => setMode('compose')}
                      data-testid="play-intent-change"
                    >
                      <Pencil className="h-4 w-4" />
                      {t('playIntent.changeIntent')}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                      onClick={() => setConfirmCancel(true)}
                      data-testid="play-intent-drawer-cancel"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('playIntent.cancelIntent')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            </div>
          )}

          {mode === 'lobby' && !activeIntent && (
            <div className="relative z-10 mx-4 mt-3 overflow-hidden rounded-2xl border border-emerald-200/80 bg-white/90 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
              <button
                type="button"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-transform active:scale-[0.99]"
                onClick={() => setMode('compose')}
                data-testid="play-intent-play-too"
              >
                <Zap className="h-4 w-4" strokeWidth={2.5} />
                {t('playIntent.playToo')}
              </button>
            </div>
          )}

          {slotsSection}

          <div>
          {reduceMotion ? (
            mode === 'compose' ? (
              <PlayIntentComposePanel
                open={open}
                cityId={cityId}
                sport={sport}
                todayKey={todayKey}
                timezone={timezone}
                initialIntent={activeIntent}
                onSubmitted={(nextIntent) => {
                  setSubmittedIntent(nextIntent);
                  setMode('lobby');
                  onChanged?.();
                }}
              />
            ) : (
              <CourtLobbyPanel
                open={open}
                onOpenChange={onOpenChange}
                members={members}
                overflow={overflow}
                partySize={partySize}
                availableCount={availableCount}
                clusterProgress={clusterProgress}
                sport={activeIntent?.sport ?? sport}
                intent={activeIntent}
                proposal={proposal}
                matchingGames={matchingGames}
                onChanged={onChanged}
              />
            )
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                className="flex min-h-0 flex-col"
                initial={{ opacity: 0, x: mode === 'lobby' ? 36 : -36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === 'lobby' ? -36 : 36 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                {mode === 'compose' ? (
                  <PlayIntentComposePanel
                    open={open}
                    cityId={cityId}
                    sport={sport}
                    todayKey={todayKey}
                    timezone={timezone}
                    initialIntent={activeIntent}
                    onSubmitted={(nextIntent) => {
                      setSubmittedIntent(nextIntent);
                      setMode('lobby');
                      onChanged?.();
                    }}
                  />
                ) : (
                  <CourtLobbyPanel
                    open={open}
                    onOpenChange={onOpenChange}
                    members={members}
                    overflow={overflow}
                    partySize={partySize}
                    availableCount={availableCount}
                    clusterProgress={clusterProgress}
                    sport={activeIntent?.sport ?? sport}
                    intent={activeIntent}
                    proposal={proposal}
                    matchingGames={matchingGames}
                    onChanged={onChanged}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
