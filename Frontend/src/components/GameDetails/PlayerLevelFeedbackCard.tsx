import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  resultsApi,
  type GameLevelEvaluations,
  type PlayerLevelVerdict,
} from '@/api/results';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { queryKeys } from '@/queries/queryKeys';
import {
  findNextFeedbackIndex,
  findNextUnansweredIndex,
  loadLevelEvaluationsWithRetry,
} from '@/features/player-level-feedback/player-level-feedback';
import { recordPlayerLevelFeedbackMetric } from '@/services/player-level-feedback-metrics';

type Props = { gameId: string };

const VERDICTS: Array<{
  value: PlayerLevelVerdict;
  icon: typeof ArrowDown;
  className: string;
  activeClassName: string;
}> = [
  {
    value: 'LOWER',
    icon: ArrowDown,
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    activeClassName: 'ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-slate-900',
  },
  {
    value: 'ABOUT_RIGHT',
    icon: Check,
    className: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200',
    activeClassName: 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-900',
  },
  {
    value: 'HIGHER',
    icon: ArrowUp,
    className: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
    activeClassName: 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900',
  },
];

function displayName(user: GameLevelEvaluations['players'][number]['user']): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Player';
}

export function PlayerLevelFeedbackCard({ gameId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [data, setData] = useState<GameLevelEvaluations | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [editingCompleteSet, setEditingCompleteSet] = useState(false);
  const promptSeenGameIdRef = useRef<string | null>(null);
  useBackButtonModal(open, () => setOpen(false), 'player-level-feedback');

  useEffect(() => {
    let active = true;
    void loadLevelEvaluationsWithRetry(
      async () => (await resultsApi.getLevelEvaluations(gameId)).data,
    )
      .then((responseData) => {
        if (active) setData(responseData);
      })
      .catch(() => {
        // Ineligible event types and non-playing viewers intentionally see no prompt.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [gameId]);

  const completedCount = data?.players.filter((player) => player.verdict !== null).length ?? 0;
  const allComplete = Boolean(data?.players.length && completedCount === data.players.length);
  const current = data?.players[index];

  useEffect(() => {
    if (!data?.players.length || (!data.canEdit && !allComplete)) return;
    if (promptSeenGameIdRef.current === gameId) return;
    promptSeenGameIdRef.current = gameId;
    recordPlayerLevelFeedbackMetric({
      event: 'prompt_seen',
      completedCount,
      totalCount: data.players.length,
    });
  }, [allComplete, completedCount, data, gameId]);

  const openFlow = useCallback(() => {
    if (!data?.canEdit) return;
    const firstUnanswered = data.players.findIndex((player) => player.verdict === null);
    setIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    setEditingCompleteSet(allComplete);
    setFinished(false);
    setOpen(true);
    recordPlayerLevelFeedbackMetric({
      event: 'opened',
      completedCount,
      totalCount: data.players.length,
    });
  }, [allComplete, completedCount, data]);

  const answer = useCallback(async (verdict: PlayerLevelVerdict) => {
    if (!data || !current || savingTargetId || !data.canEdit) return;
    const targetId = current.user.id;
    const previous = current.verdict;
    const nextPlayers = data.players.map((player) =>
      player.user.id === targetId ? { ...player, verdict } : player
    );
    setSavingTargetId(targetId);
    setData((value) => value ? {
      ...value,
      players: nextPlayers,
    } : value);
    try {
      await resultsApi.upsertLevelEvaluation(gameId, targetId, verdict);
      void queryClient.invalidateQueries({ queryKey: queryKeys.userStatsAll(targetId) });
      if (previous !== null && previous !== verdict) {
        recordPlayerLevelFeedbackMetric({ event: 'edited' });
      }
      const nextIndex = findNextFeedbackIndex(nextPlayers, index, editingCompleteSet);
      if (nextIndex !== null) {
        setIndex(nextIndex);
      } else {
        setFinished(true);
        if (!editingCompleteSet) {
          recordPlayerLevelFeedbackMetric({
            event: 'completed',
            completedCount: nextPlayers.filter((player) => player.verdict !== null).length,
            totalCount: nextPlayers.length,
          });
        }
      }
    } catch {
      setData((value) => value ? {
        ...value,
        players: value.players.map((player) =>
          player.user.id === targetId ? { ...player, verdict: previous } : player
        ),
      } : value);
      recordPlayerLevelFeedbackMetric({ event: 'save_failed' });
      toast.error(t('gameResults.levelFeedback.saveFailed'));
    } finally {
      setSavingTargetId(null);
    }
  }, [current, data, editingCompleteSet, gameId, index, queryClient, savingTargetId, t]);

  const progressLabel = useMemo(() => {
    if (!data?.players.length) return '';
    return t('gameResults.levelFeedback.progress', {
      current: Math.min(index + 1, data.players.length),
      total: data.players.length,
    });
  }, [data?.players.length, index, t]);

  if (loading || !data?.players.length) return null;
  if (!data.canEdit && !allComplete) return null;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-0 mt-4 overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-400/15 dark:from-sky-950/35 dark:via-slate-900 dark:to-violet-950/25"
      >
        <button
          type="button"
          onClick={openFlow}
          disabled={!data.canEdit}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors enabled:hover:bg-white/45 disabled:cursor-default dark:enabled:hover:bg-white/[0.035]"
          aria-label={t('gameResults.levelFeedback.open')}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md shadow-sky-600/20">
            {allComplete ? <Check size={22} aria-hidden /> : <BarChart3 size={22} aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">
              {allComplete
                ? t('gameResults.levelFeedback.sentTitle')
                : t('gameResults.levelFeedback.cardTitle')}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {allComplete
                ? t(data.canEdit
                  ? 'gameResults.levelFeedback.sentDescription'
                  : 'gameResults.levelFeedback.sentDescriptionReadOnly')
                : t('gameResults.levelFeedback.cardDescription')}
            </span>
            {!allComplete && completedCount > 0 ? (
              <span className="mt-1 block text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                {t('gameResults.levelFeedback.savedProgress', {
                  completed: completedCount,
                  total: data.players.length,
                })}
              </span>
            ) : null}
          </span>
          {data.canEdit ? <ChevronRight className="shrink-0 text-slate-400" size={20} aria-hidden /> : null}
        </button>
      </motion.section>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className="max-h-[92dvh] overflow-hidden rounded-t-[32px] border-x border-t border-slate-200/80 bg-slate-50 shadow-[0_-24px_70px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-slate-950"
          accessibleTitle={t('gameResults.levelFeedback.sheetTitle')}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" aria-hidden />
          <DrawerCloseButton className="absolute right-4 top-3.5 z-10" aria-label={t('common.close')} />

          <DrawerHeader className="px-5 pb-2 pt-5 text-left">
            <DrawerTitle className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {t('gameResults.levelFeedback.sheetTitle')}
            </DrawerTitle>
            <DrawerDescription className="max-w-sm leading-relaxed">
              {t('gameResults.levelFeedback.sheetDescription')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <AnimatePresence mode="wait">
              {finished ? (
                <motion.div
                  key="finished"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[330px] flex-col items-center justify-center text-center"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                    <Check size={38} strokeWidth={2.5} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-xl font-black text-slate-950 dark:text-white">
                    {t('gameResults.levelFeedback.thanksTitle')}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {t('gameResults.levelFeedback.thanksDescription')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-7 h-12 w-full max-w-xs rounded-2xl bg-slate-900 px-5 text-sm font-bold text-white shadow-lg dark:bg-white dark:text-slate-950"
                  >
                    {t('common.done', { defaultValue: 'Done' })}
                  </button>
                </motion.div>
              ) : current ? (
                <motion.div
                  key={current.user.id}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="mb-4 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>{progressLabel}</span>
                    <span>{t('gameResults.levelFeedback.autoSaved')}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
                      animate={{ width: `${((index + 1) / data.players.length) * 100}%` }}
                    />
                  </div>

                  <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-100 to-violet-100 text-2xl font-black text-sky-700 ring-4 ring-white shadow-md dark:from-sky-500/20 dark:to-violet-500/20 dark:text-sky-200 dark:ring-slate-900">
                      {current.user.avatar || current.user.originalAvatar ? (
                        <img
                          src={current.user.avatar ?? current.user.originalAvatar ?? ''}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        displayName(current.user).slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
                      {displayName(current.user)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {t('gameResults.levelFeedback.shownAs', {
                        level: current.levelSnapshot.toFixed(2),
                      })}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {t('gameResults.levelFeedback.question')}
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {VERDICTS.map(({ value, icon: Icon, className, activeClassName }) => {
                        const selected = current.verdict === value;
                        const saving = savingTargetId === current.user.id && selected;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => void answer(value)}
                            disabled={Boolean(savingTargetId) || !data.canEdit}
                            aria-pressed={selected}
                            className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-3 text-xs font-bold transition-all active:scale-95 disabled:cursor-wait disabled:opacity-70 ${className} ${selected ? activeClassName : ''}`}
                          >
                            {saving ? <Loader2 className="animate-spin" size={20} /> : <Icon size={20} strokeWidth={2.4} />}
                            <span>{t(`gameResults.levelFeedback.verdict.${value}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-200/60 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
                    <span>{t('gameResults.levelFeedback.privacy')}</span>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        recordPlayerLevelFeedbackMetric({
                          event: 'skipped',
                          completedCount,
                          totalCount: data.players.length,
                        });
                        const nextIndex = editingCompleteSet
                          ? findNextFeedbackIndex(data.players, index, true)
                          : findNextUnansweredIndex(data.players, index);
                        if (nextIndex !== null) setIndex(nextIndex);
                        else setOpen(false);
                      }}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5"
                    >
                      {editingCompleteSet
                        ? t('common.next', { defaultValue: 'Next' })
                        : t('gameResults.levelFeedback.skip')}
                    </button>
                    {index > 0 ? (
                      <button
                        type="button"
                        onClick={() => setIndex(index - 1)}
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-400/10"
                      >
                        {t('common.back')}
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
