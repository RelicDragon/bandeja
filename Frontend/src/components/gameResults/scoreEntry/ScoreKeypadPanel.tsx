import { forwardRef, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BasicUser } from '@/types';
import { ScoreKeypadTeamContent } from './ScoreKeypadTeamContent';
import {
  keypadTeamSlideVariants,
  resolveKeypadSlideDirection,
  type KeypadSlideDirection,
} from './scoreKeypadSlide';

interface ScoreKeypadPanelProps {
  activeTeam: 'teamA' | 'teamB';
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  teamANumberOptions: number[];
  teamBNumberOptions: number[];
  teamAScore: number;
  teamBScore: number;
  keypadMax: number;
  onSelect: (n: number) => void;
  clampToAllowed: (value: number) => number;
  density: 'comfortable' | 'compact';
  onClose: () => void;
  onOpenComplete?: () => void;
  onTeamSlideComplete?: () => void;
}

export const ScoreKeypadPanel = forwardRef<HTMLDivElement, ScoreKeypadPanelProps>(
  function ScoreKeypadPanel(
    {
      activeTeam,
      teamAPlayers,
      teamBPlayers,
      teamANumberOptions,
      teamBNumberOptions,
      teamAScore,
      teamBScore,
      keypadMax,
      onSelect,
      clampToAllowed,
      density,
      onClose,
      onOpenComplete,
      onTeamSlideComplete,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const previousTeamRef = useRef(activeTeam);
    const slideDirectionRef = useRef<KeypadSlideDirection>(0);

    let slideDirection = slideDirectionRef.current;
    if (previousTeamRef.current !== activeTeam) {
      slideDirection = resolveKeypadSlideDirection(previousTeamRef.current, activeTeam);
      slideDirectionRef.current = slideDirection;
    }

    useLayoutEffect(() => {
      previousTeamRef.current = activeTeam;
    }, [activeTeam]);

    const activePlayers = activeTeam === 'teamA' ? teamAPlayers : teamBPlayers;
    const activeNumberOptions = activeTeam === 'teamA' ? teamANumberOptions : teamBNumberOptions;
    const activeScore = activeTeam === 'teamA' ? teamAScore : teamBScore;

    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onAnimationComplete={(definition) => {
          const isExit =
            definition === 'exit'
            || (typeof definition === 'object'
              && definition !== null
              && 'opacity' in definition
              && (definition as { opacity?: number }).opacity === 0);
          if (isExit) return;
          onOpenComplete?.();
        }}
        className="overflow-hidden"
      >
        <div
          ref={ref}
          className="relative mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X size={15} />
          </button>

          <div className="relative overflow-hidden">
            <AnimatePresence initial={false} custom={slideDirection} mode="popLayout">
              <motion.div
                key={activeTeam}
                custom={slideDirection}
                variants={keypadTeamSlideVariants}
                initial={slideDirection === 0 ? false : 'enter'}
                animate="center"
                exit="exit"
                className="w-full"
                onAnimationComplete={(definition) => {
                  const isExit =
                    definition === 'exit'
                    || (typeof definition === 'object'
                      && definition !== null
                      && 'opacity' in definition
                      && (definition as { opacity?: number }).opacity === 0);
                  if (isExit) return;
                  if (slideDirection !== 0) onTeamSlideComplete?.();
                }}
              >
                <ScoreKeypadTeamContent
                  players={activePlayers}
                  numberOptions={activeNumberOptions}
                  keypadMax={keypadMax}
                  currentScore={activeScore}
                  onSelect={onSelect}
                  clampToAllowed={clampToAllowed}
                  density={density}
                  teamKey={activeTeam}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    );
  },
);
