import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { OVERLAY_CONTROL_GLASS_STABLE } from '@/components/ui/overlayControlGlass';
import { ScoringPreset } from '@/types';
import { GameFormatStepScoringMode } from './GameFormatStepScoringMode';
import { GameFormatStepSetStructure } from './GameFormatStepSetStructure';
import { GameFormatStepPointsTotal } from './GameFormatStepPointsTotal';
import { GameFormatStepRanking } from './GameFormatStepRanking';
import { GameFormatSummary } from './GameFormatSummary';
import { UseGameFormatResult } from '@/hooks/useGameFormat';

export type GameFormatWizardStep =
  | 'scoringMode'
  | 'setStructure'
  | 'pointsTotal'
  | 'ranking';

interface GameFormatWizardProps {
  isOpen: boolean;
  format: UseGameFormatResult;
  onClose: () => void;
  onDone?: () => void;
}

const CLASSIC_STRUCTURE_PRESETS: ScoringPreset[] = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_SHORT_SET',
  'CLASSIC_PRO_SET',
];

const POINTS_TARGET_PRESETS: ScoringPreset[] = ['POINTS_16', 'POINTS_21', 'POINTS_24', 'POINTS_32'];

function isSetStructureStepValid(f: UseGameFormatResult): boolean {
  if (f.scoringMode !== 'CLASSIC') return true;
  if (f.isTimed) {
    return (
      f.scoringPreset === 'CLASSIC_TIMED' &&
      f.matchTimedCapMinutes >= 1 &&
      f.matchTimedCapMinutes <= 60
    );
  }
  return CLASSIC_STRUCTURE_PRESETS.includes(f.scoringPreset);
}

function isPointsTotalStepValid(f: UseGameFormatResult): boolean {
  if (f.scoringMode !== 'POINTS') return true;
  if (f.isTimed) {
    return f.scoringPreset === 'TIMED' && f.matchTimedCapMinutes >= 1 && f.matchTimedCapMinutes <= 60;
  }
  if (f.customPointsTotal != null) {
    return f.customPointsTotal > 0 && f.customPointsTotal <= 999;
  }
  return POINTS_TARGET_PRESETS.includes(f.scoringPreset);
}

function isRankingStepValid(f: UseGameFormatResult): boolean {
  if (f.winnerOfGame !== 'BY_POINTS') return true;
  return f.pointsPerWin + f.pointsPerTie + f.pointsPerLoose > 0;
}

function canFloatingContinueForStep(step: GameFormatWizardStep, f: UseGameFormatResult): boolean {
  if (step === 'setStructure') return isSetStructureStepValid(f);
  if (step === 'pointsTotal') return isPointsTotalStepValid(f);
  if (step === 'ranking') return isRankingStepValid(f);
  return true;
}

const WIZARD_FLOAT_GLASS = [
  'flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold',
  OVERLAY_CONTROL_GLASS_STABLE,
  'outline-none [-webkit-tap-highlight-color:transparent]',
  'focus:bg-white/82 focus:text-gray-900 focus:backdrop-blur-sm',
  'dark:focus:bg-black/60 dark:focus:text-white',
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/45',
].join(' ');

function wizardNavPointerDownNoFocus(e: PointerEvent<HTMLButtonElement>) {
  if (e.button !== 0) return;
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
    e.preventDefault();
  }
}

function wizardNavBlurAfterClick(el: HTMLButtonElement) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.blur();
    });
  });
}

export const GameFormatWizard = ({
  isOpen,
  format,
  onClose,
  onDone,
}: GameFormatWizardProps) => {
  const { t } = useTranslation();

  const [stepIdx, setStepIdx] = useState(0);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const prevStepIdxRef = useRef(0);
  const prevStepsSigRef = useRef('');
  const lastViewedStepRef = useRef<GameFormatWizardStep>('scoringMode');

  const currentSteps = useMemo((): GameFormatWizardStep[] => {
    const arr: GameFormatWizardStep[] = ['scoringMode'];
    if (format.scoringMode === 'CLASSIC') arr.push('setStructure');
    if (format.scoringMode === 'POINTS') arr.push('pointsTotal');
    arr.push('ranking');
    return arr;
  }, [format.scoringMode]);

  const stepsSig = useMemo(() => currentSteps.join(','), [currentSteps]);

  const safeStepIdx = Math.min(stepIdx, currentSteps.length - 1);
  const safeCurrentStep = currentSteps[safeStepIdx];

  useLayoutEffect(() => {
    if (!isOpen) {
      prevStepsSigRef.current = '';
      return;
    }
    const prev = prevStepsSigRef.current;
    let resolvedIdx = Math.min(stepIdx, currentSteps.length - 1);
    if (prev && prev !== stepsSig) {
      const keep = lastViewedStepRef.current;
      const ni = currentSteps.indexOf(keep);
      if (ni >= 0) {
        setStepIdx(ni);
        resolvedIdx = ni;
      } else {
        resolvedIdx = Math.min(stepIdx, currentSteps.length - 1);
        setStepIdx(resolvedIdx);
      }
    }
    prevStepsSigRef.current = stepsSig;
    lastViewedStepRef.current = currentSteps[resolvedIdx];
  }, [isOpen, stepsSig, currentSteps, stepIdx]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = prevStepIdxRef.current;
    if (safeStepIdx > prev) {
      bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevStepIdxRef.current = safeStepIdx;
  }, [isOpen, safeStepIdx]);

  const handleNext = () => {
    if (safeStepIdx < currentSteps.length - 1) {
      setStepIdx(safeStepIdx + 1);
    } else {
      onDone?.();
      onClose();
    }
  };

  const handleClose = () => {
    setStepIdx(0);
    prevStepsSigRef.current = '';
    onClose();
  };

  const handlePrev = () => {
    setStepIdx(Math.max(0, safeStepIdx - 1));
  };

  const showFloatingPrev = safeStepIdx >= 1;
  const isLastStep = safeStepIdx >= currentSteps.length - 1;
  const canFloatingContinue = canFloatingContinueForStep(safeCurrentStep, format);

  const bodyBottomPad = 'pb-20';

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="game-format-wizard">
      <DialogContent className="max-w-[500px] max-h-[92vh] flex flex-col">
        <DialogHeader className="!p-4 !pb-3 flex-col items-stretch gap-3 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base">{t('gameFormat.title')}</DialogTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {currentSteps.map((s, i) => (
              <div
                key={`${s}-${i}`}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  i <= safeStepIdx
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 min-w-0">
                <span className="font-semibold text-primary-600 dark:text-primary-400 shrink-0">
                  {safeStepIdx + 1}/{currentSteps.length}
                </span>
                <span className="text-gray-900 dark:text-gray-200 font-medium truncate">
                  {t(`gameFormat.steps.${safeCurrentStep}`)}
                </span>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 px-0.5 min-w-0 m-0">
              <GameFormatSummary
                className="block truncate"
                scoringMode={format.scoringMode}
                scoringPreset={format.scoringPreset}
                generationType={format.generationType}
                hasGoldenPoint={format.hasGoldenPoint}
                isTimed={format.isTimed}
                matchTimedCapMinutes={format.matchTimedCapMinutes}
                customPointsTotal={format.customPointsTotal}
              />
            </p>
          </div>
        </DialogHeader>

        <div
          ref={bodyScrollRef}
          className={`flex-1 min-h-0 overflow-y-auto scrollbar-auto px-4 py-3 ${bodyBottomPad}`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={safeCurrentStep}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {safeCurrentStep === 'scoringMode' && (
                <GameFormatStepScoringMode
                  scoringMode={format.scoringMode}
                  onChange={(mode) => {
                    format.setScoringMode(mode);
                  }}
                  onSelectAdvance={handleNext}
                />
              )}
              {safeCurrentStep === 'setStructure' && (
                <GameFormatStepSetStructure
                  scoringPreset={format.scoringPreset}
                  hasGoldenPoint={format.hasGoldenPoint}
                  isTimed={format.isTimed}
                  matchTimedCapMinutes={format.matchTimedCapMinutes}
                  onPresetChange={format.setScoringPreset}
                  onGoldenPointChange={format.setHasGoldenPoint}
                  onTimedCapChange={format.setMatchTimedCap}
                  onTimedCapMinutesChange={format.setMatchTimedCapMinutes}
                  onSelectAdvance={handleNext}
                />
              )}
              {safeCurrentStep === 'pointsTotal' && (
                <GameFormatStepPointsTotal
                  scoringPreset={format.scoringPreset}
                  isTimed={format.isTimed}
                  matchTimedCapMinutes={format.matchTimedCapMinutes}
                  customPointsTotal={format.customPointsTotal}
                  onPresetChange={format.setScoringPreset}
                  onTimedChange={format.setMatchTimedCap}
                  onTimedCapMinutesChange={format.setMatchTimedCapMinutes}
                  onCustomPointsChange={format.setCustomPointsTotal}
                  onSelectAdvance={handleNext}
                />
              )}
              {safeCurrentStep === 'ranking' && (
                <GameFormatStepRanking
                  pointsPerWin={format.pointsPerWin}
                  pointsPerLoose={format.pointsPerLoose}
                  pointsPerTie={format.pointsPerTie}
                  winnerOfGame={format.winnerOfGame}
                  onChange={format.setRanking}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 isolate flex items-end justify-between px-4 pb-4">
          <button
            type="button"
            onPointerDown={wizardNavPointerDownNoFocus}
            onClick={(e) => {
              handlePrev();
              wizardNavBlurAfterClick(e.currentTarget);
            }}
            tabIndex={showFloatingPrev ? 0 : -1}
            aria-hidden={!showFloatingPrev}
            className={`pointer-events-auto ${WIZARD_FLOAT_GLASS} ${
              showFloatingPrev ? '' : 'pointer-events-none invisible'
            }`}
          >
            <ChevronLeft size={18} strokeWidth={2.25} />
            {t('common.back')}
          </button>
          <button
            type="button"
            tabIndex={!canFloatingContinue ? -1 : 0}
            onPointerDown={wizardNavPointerDownNoFocus}
            onClick={(e) => {
              if (!canFloatingContinue) return;
              handleNext();
              wizardNavBlurAfterClick(e.currentTarget);
            }}
            aria-disabled={!canFloatingContinue}
            className={`pointer-events-auto ${WIZARD_FLOAT_GLASS} ${
              !canFloatingContinue ? 'cursor-not-allowed opacity-40' : ''
            }`}
          >
            {isLastStep ? (
              <>
                <Check size={18} strokeWidth={2.25} />
                {t('common.done')}
              </>
            ) : (
              <>
                <ChevronRight size={18} strokeWidth={2.25} />
                {t('common.next')}
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
