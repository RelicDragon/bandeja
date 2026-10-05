import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PartyPopper } from 'lucide-react';
import {
  NOVICE_MAX_RANK,
  NOVICE_RANKS,
  noviceProgressToRegular,
  noviceRankId,
} from '@shared/novice';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';
import { NoviceCelebrationBurst } from './NoviceCelebrationBurst';
import { NoviceRankEmblem } from './NoviceRankEmblem';
import { NOVICE_FEATURE_ICONS, noviceRankNameKey } from './noviceCelebrationMeta';
import type { NoviceCelebrationStep } from './noviceCelebrationPlan';

type NoviceCelebrationSequenceProps = {
  steps: NoviceCelebrationStep[];
  /** Last step dismissed. Called once. */
  onFinish: () => void;
};

/** Ignore taps this soon after a step appears (double-tap skipping). */
const ADVANCE_GUARD_MS = 450;

const ease = [0.22, 1, 0.36, 1] as const;

function formatLevel(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '–';
}

function StepHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-balance text-center text-3xl font-black tracking-tight text-white">
      {children}
    </h2>
  );
}

function CongratsStep({
  step,
  headingId,
}: {
  step: Extract<NoviceCelebrationStep, { kind: 'congrats' }>;
  headingId: string;
}) {
  const { t } = useTranslation();
  const { result } = step;
  const delta = result ? result.levelAfter - result.levelBefore : 0;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
        <PartyPopper size={48} className="text-amber-300" aria-hidden />
      </div>
      <StepHeading id={headingId}>
        {step.isFirstGame
          ? t('novice.celebration.congrats.firstTitle')
          : t('novice.celebration.congrats.gameTitle', { number: step.gameNumber })}
      </StepHeading>
      <p className="max-w-xs text-center text-base text-white/75">
        {t('novice.celebration.congrats.subtitle')}
      </p>
      {result && (
        <div className="w-full max-w-xs rounded-2xl bg-white/10 p-4 ring-1 ring-white/15" data-testid="novice-celebration-result">
          {result.isWinner && (
            <p className="mb-2 text-center text-sm font-bold text-amber-300">
              {t('novice.celebration.congrats.won')}
            </p>
          )}
          <div className="flex items-center justify-between text-white">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
              {t('novice.celebration.congrats.level')}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {formatLevel(result.levelBefore)} → {formatLevel(result.levelAfter)}
              {delta !== 0 && (
                <span className={`ms-1.5 ${delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(2)}
                </span>
              )}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['wins', result.wins],
                ['ties', result.ties],
                ['losses', result.losses],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-white/5 py-2">
                <div className="text-lg font-black tabular-nums text-white">{value}</div>
                <div className="text-[11px] font-medium text-white/60">
                  {t(`novice.celebration.congrats.${key}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AchievementsStep({
  step,
  headingId,
  reduceMotion,
}: {
  step: Extract<NoviceCelebrationStep, { kind: 'achievements' }>;
  headingId: string;
  reduceMotion: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
        {t('novice.celebration.achievements.eyebrow')}
      </p>
      <StepHeading id={headingId}>
        {step.items.length === 1
          ? t('novice.celebration.achievements.titleOne')
          : t('novice.celebration.achievements.titleMany')}
      </StepHeading>
      <ul className="flex w-full max-w-xs flex-col gap-3">
        {step.items.map((item, i) => (
          <motion.li
            key={item.definitionId}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.35, ease }}
            className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15"
          >
            <TrophyRarityFrame rarity={item.rarity} className="h-14 w-14 shrink-0 rounded-2xl">
              <TrophyArt artKey={item.artKey} className="h-10 w-12" />
            </TrophyRarityFrame>
            <span className="min-w-0 flex-1 text-start text-base font-bold text-white">{t(item.titleKey)}</span>
          </motion.li>
        ))}
      </ul>
      <p className="text-center text-sm text-white/65">{t('novice.celebration.achievements.subtitle')}</p>
    </div>
  );
}

function RankLadder({ toRank, reduceMotion }: { toRank: number; reduceMotion: boolean }) {
  const { t } = useTranslation();
  return (
    <ol className="flex w-full max-w-xs items-center justify-between" aria-label={t('novice.celebration.rankUp.ladder')}>
      {NOVICE_RANKS.map((r) => {
        const reached = r.rank <= toRank;
        const current = r.rank === toRank;
        return (
          <li
            key={r.id}
            className={`flex items-center ${r.rank > 0 ? 'flex-1' : ''}`}
            aria-current={current ? 'step' : undefined}
          >
            {r.rank > 0 && (
              <motion.span
                className={`h-0.5 flex-1 origin-left ${reached ? 'bg-amber-300' : 'bg-white/20'}`}
                initial={reached && !reduceMotion ? { scaleX: 0 } : false}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5 + r.rank * 0.08, duration: 0.3 }}
                aria-hidden
              />
            )}
            <span
              className={`relative flex shrink-0 items-center justify-center rounded-full ${
                current ? 'h-4 w-4 bg-amber-300 ring-4 ring-amber-300/30' : reached ? 'h-2.5 w-2.5 bg-amber-300' : 'h-2.5 w-2.5 bg-white/25'
              }`}
            >
              <span className="sr-only">{t(noviceRankNameKey(r.rank))}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RankUpStep({
  step,
  headingId,
  reduceMotion,
}: {
  step: Extract<NoviceCelebrationStep, { kind: 'rankUp' }>;
  headingId: string;
  reduceMotion: boolean;
}) {
  const { t } = useTranslation();
  const [landed, setLanded] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      hapticSuccess();
      return;
    }
    const timer = setTimeout(() => {
      setLanded(true);
      hapticSuccess();
    }, 650);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  const progress = noviceProgressToRegular(step.countedGames);
  const isRegular = step.toRank >= NOVICE_MAX_RANK;

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
        {t('novice.celebration.rankUp.eyebrow')}
      </p>
      <div className="relative flex h-40 w-40 items-center justify-center">
        {landed && <NoviceCelebrationBurst reduceMotion={reduceMotion} />}
        {landed ? (
          <NoviceRankEmblem key="to" rank={step.toRank} pop reduceMotion={reduceMotion} />
        ) : (
          <motion.div
            key="from"
            animate={{ scale: [1, 1.08, 0.82], opacity: [1, 1, 0.6] }}
            transition={{ duration: 0.65, ease: 'easeIn' }}
          >
            <NoviceRankEmblem rank={step.fromRank} />
          </motion.div>
        )}
      </div>
      <StepHeading id={headingId}>
        {t('novice.celebration.rankUp.title', { rank: t(noviceRankNameKey(step.toRank)) })}
      </StepHeading>
      {step.toRank - step.fromRank > 1 && (
        <p className="text-center text-sm text-white/70" data-testid="novice-celebration-jump">
          {t('novice.celebration.rankUp.jumped', {
            from: t(noviceRankNameKey(step.fromRank)),
            to: t(noviceRankNameKey(step.toRank)),
          })}
        </p>
      )}
      <RankLadder toRank={step.toRank} reduceMotion={reduceMotion} />
      <p className="text-center text-sm font-semibold text-white/80 tabular-nums">
        {isRegular
          ? t('novice.celebration.rankUp.regularReached')
          : t('novice.celebration.rankUp.progress', { current: progress.current, target: progress.target })}
      </p>
    </div>
  );
}

function FeaturesStep({
  step,
  headingId,
  reduceMotion,
}: {
  step: Extract<NoviceCelebrationStep, { kind: 'features' }>;
  headingId: string;
  reduceMotion: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {step.isRegular && <NoviceRankEmblem rank={NOVICE_MAX_RANK} size="sm" />}
      <StepHeading id={headingId}>
        {step.isRegular ? t('novice.celebration.features.regularTitle') : t('novice.celebration.features.title')}
      </StepHeading>
      {step.isRegular && (
        <p className="max-w-xs text-center text-sm text-white/70">{t('novice.celebration.features.regularSubtitle')}</p>
      )}
      <ul className="flex w-full max-w-sm flex-col gap-2">
        {step.features.map((feature, i) => {
          const Icon = NOVICE_FEATURE_ICONS[feature];
          return (
            <motion.li
              key={feature}
              data-testid={`novice-feature-${feature}`}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + i * 0.09, duration: 0.32, ease }}
              className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon size={20} className="text-white" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block text-sm font-bold text-white">
                  {t('novice.celebration.features.unlockedName', {
                    name: t(`novice.celebration.features.items.${feature}.name`),
                  })}
                </span>
                <span className="block text-xs leading-snug text-white/65">
                  {t(`novice.celebration.features.items.${feature}.desc`)}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * PRD 358 — the blocking full-screen novice milestone sequence. Advances on
 * Continue (or a tap on the stage); no swipe needed. Android back advances too.
 */
export function NoviceCelebrationSequence({ steps, onFinish }: NoviceCelebrationSequenceProps) {
  const { t } = useTranslation();
  const reduceMotion = Boolean(useReducedMotion());
  const [index, setIndex] = useState(0);
  const shownAtRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const isLast = index >= steps.length - 1;
  const headingId = `novice-celebration-heading-${index}`;
  const rankForTheme = steps.find((s) => s.kind === 'rankUp');
  const themeRank = rankForTheme?.kind === 'rankUp' ? rankForTheme.toRank : 1;

  const advance = useCallback(
    (force = false) => {
      if (finishedRef.current) return;
      if (!force && Date.now() - shownAtRef.current < ADVANCE_GUARD_MS) return;
      if (index >= steps.length - 1) {
        finishedRef.current = true;
        onFinish();
        return;
      }
      hapticSelection();
      shownAtRef.current = Date.now();
      setIndex((i) => i + 1);
    },
    [index, steps.length, onFinish],
  );

  useBackButtonModal(true, () => advance(true), 'novice-celebration');

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, [index]);

  if (!step) return null;

  const content = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="novice-celebration"
      data-rank={noviceRankId(themeRank)}
      className="fixed inset-0 z-[1000] flex flex-col overflow-hidden bg-gradient-to-b from-slate-950 via-primary-950 to-slate-900 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.3 }}
    >
      <div
        className="flex shrink-0 justify-center gap-1.5 px-6 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        aria-hidden
      >
        {steps.map((s, i) => (
          <span
            key={`${s.kind}-${i}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-white' : i < index ? 'w-1.5 bg-white/70' : 'w-1.5 bg-white/25'}`}
          />
        ))}
      </div>

      <div
        className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-y-auto px-6 py-4"
        onClick={() => advance()}
        data-testid="novice-celebration-stage"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            className="flex w-full flex-col items-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.32, ease }}
          >
            {step.kind === 'congrats' && <CongratsStep step={step} headingId={headingId} />}
            {step.kind === 'achievements' && (
              <AchievementsStep step={step} headingId={headingId} reduceMotion={reduceMotion} />
            )}
            {step.kind === 'rankUp' && (
              <RankUpStep step={step} headingId={headingId} reduceMotion={reduceMotion} />
            )}
            {step.kind === 'features' && (
              <FeaturesStep step={step} headingId={headingId} reduceMotion={reduceMotion} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="shrink-0 px-6 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        <button
          ref={continueRef}
          type="button"
          onClick={() => advance(true)}
          data-testid="novice-celebration-continue"
          className="mx-auto block w-full max-w-sm rounded-2xl bg-white px-5 py-4 text-base font-bold text-slate-950 shadow-lg transition active:scale-[0.98]"
        >
          {isLast ? t('novice.celebration.done') : t('novice.celebration.continue')}
        </button>
      </div>
    </motion.div>
  );

  return createPortal(content, document.body);
}
