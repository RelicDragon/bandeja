import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DialogClose, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  AutomaticDeciderSetModeSwitch,
  AutomaticMatchRecordModeSwitch,
} from '@/components/gameResults/AutomaticRelaxedScoreEntryControls';
import { SegmentedSwitch } from '@/components';
import type { AutomaticMatchRecordMode } from '@/utils/scoring/automaticRelaxedScoring';
import type { ValidationReason, ScoreSuggestion } from '@/utils/scoring';
import { ScoreValidationHint } from './ScoreValidationHint';
import { SCORE_ENTRY_EASE, SOFT_CONTROL_CLASS } from './scoreEntryStyles';

interface ScoreEntryHeaderProps {
  mainTitle: string;
  /** Where this score belongs, e.g. "Round 3 · Match 2 · Set 2". */
  contextLine?: string | null;
  descriptionLine: string | null;
  courtLabel?: string | null;
  isSupplementalRow: boolean;
  isAutomaticRelaxed: boolean;
  setIndex: number;
  canUseSuperTiebreak: boolean;
  matchRecordMode: AutomaticMatchRecordMode;
  persistedRecordMode: AutomaticMatchRecordMode;
  useSuperTiebreak: boolean;
  extraRole: 'EXTRA_GAMES' | 'EXTRA_BALLS';
  extraRoleTabs: { id: string; label: string }[];
  extraSetHint: string;
  onMatchRecordModeChange: (mode: AutomaticMatchRecordMode) => void;
  onSuperTiebreakChange: (use: boolean) => void;
  onExtraRoleChange: (role: 'EXTRA_GAMES' | 'EXTRA_BALLS') => void;
  showScoreValidation: boolean;
  validationReason?: ValidationReason;
  validationDetail?: Record<string, number | string>;
  validationSuggestions: ScoreSuggestion[];
  onApplySuggestion: (suggestion: ScoreSuggestion) => void;
}

const headerSlotClass = 'relative shrink-0 px-5 pb-3 pt-4 min-h-[7.25rem]';

const SLOT_SWAP = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: SCORE_ENTRY_EASE },
};

export const ScoreEntryHeader = ({
  mainTitle,
  contextLine,
  descriptionLine,
  courtLabel,
  isSupplementalRow,
  isAutomaticRelaxed,
  setIndex,
  canUseSuperTiebreak,
  matchRecordMode,
  persistedRecordMode,
  useSuperTiebreak,
  extraRole,
  extraRoleTabs,
  extraSetHint,
  onMatchRecordModeChange,
  onSuperTiebreakChange,
  onExtraRoleChange,
  showScoreValidation,
  validationReason,
  validationDetail,
  validationSuggestions,
  onApplySuggestion,
}: ScoreEntryHeaderProps) => {
  const { t } = useTranslation();
  const court = courtLabel?.trim() || null;
  const showDescription = !isSupplementalRow && Boolean(descriptionLine);

  return (
    <div className={headerSlotClass}>
      {/* Ambient wash behind the title; static, clipped by the dialog. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-40 w-4/5 rounded-full bg-primary-400/[0.12] blur-3xl dark:bg-primary-500/[0.14]"
      />
      <DialogClose
        tabIndex={-1}
        className={`absolute end-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 ${SOFT_CONTROL_CLASS}`}
      >
        <X size={17} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">{t('common.close')}</span>
      </DialogClose>
      <AnimatePresence mode="wait" initial={false}>
        {showScoreValidation && validationReason ? (
          <motion.div key="validation" {...SLOT_SWAP} className="relative me-11">
            <ScoreValidationHint
              reason={validationReason}
              detail={validationDetail}
              isRecommendation={isAutomaticRelaxed}
              suggestions={validationSuggestions}
              onApplySuggestion={onApplySuggestion}
            />
          </motion.div>
        ) : (
          <motion.div key="meta" {...SLOT_SWAP} className="relative">
            {contextLine ? (
              <p className="mb-2.5 me-11 inline-flex max-w-[calc(100%-2.75rem)] items-center gap-1.5 rounded-full bg-primary-500/[0.09] px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-primary-700 ring-1 ring-inset ring-primary-500/15 dark:bg-primary-400/10 dark:text-primary-300 dark:ring-primary-400/20">
                <span className="h-1 w-1 shrink-0 rounded-full bg-primary-500 dark:bg-primary-400" aria-hidden />
                <span className="truncate">{contextLine}</span>
              </p>
            ) : null}
            {/* The title keeps its row to itself so longer translations stay on one line. */}
            <DialogTitle className="mb-0 pe-11! text-[1.25rem] font-semibold leading-tight tracking-[-0.015em] text-gray-900 dark:text-white">
              {mainTitle}
            </DialogTitle>

            {showDescription || court ? (
              <div className="mt-1.5 flex items-center justify-between gap-3">
                {showDescription ? (
                  <DialogDescription className="min-w-0 text-[12.5px] leading-snug text-gray-500 dark:text-gray-400">
                    {descriptionLine}
                  </DialogDescription>
                ) : (
                  <span aria-hidden />
                )}
                {court ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-900/[0.04] px-2.5 py-1 text-[11px] font-medium leading-none text-gray-600 ring-1 ring-inset ring-gray-900/[0.05] dark:bg-white/[0.05] dark:text-gray-300 dark:ring-white/[0.07]">
                    <MapPin size={11} strokeWidth={1.75} aria-hidden />
                    {court}
                  </span>
                ) : null}
              </div>
            ) : null}

            {isAutomaticRelaxed && !isSupplementalRow && setIndex === 0 ? (
              <AutomaticMatchRecordModeSwitch mode={matchRecordMode} onChange={onMatchRecordModeChange} />
            ) : null}

            {isAutomaticRelaxed && !isSupplementalRow && setIndex > 0 && canUseSuperTiebreak ? (
              <AutomaticDeciderSetModeSwitch
                matchRecordMode={persistedRecordMode}
                useSuperTiebreak={useSuperTiebreak}
                onChange={onSuperTiebreakChange}
              />
            ) : null}

            {isSupplementalRow ? (
              <div className="mt-2.5">
                <p className="mb-1.5 text-[12.5px] text-gray-500 dark:text-gray-400">{extraSetHint}</p>
                <SegmentedSwitch
                  tabs={extraRoleTabs}
                  activeId={extraRole}
                  onChange={(id) => onExtraRoleChange(id as 'EXTRA_GAMES' | 'EXTRA_BALLS')}
                  showOnlyActiveTabText={false}
                  layoutId="score-entry-extra-role"
                  fullWidth
                  ariaLabel={extraSetHint}
                />
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
