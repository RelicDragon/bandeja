import { AnimatePresence, motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
  AutomaticDeciderSetModeSwitch,
  AutomaticMatchRecordModeSwitch,
} from '@/components/gameResults/AutomaticRelaxedScoreEntryControls';
import { SegmentedSwitch } from '@/components';
import type { AutomaticMatchRecordMode } from '@/utils/scoring/automaticRelaxedScoring';
import type { ValidationReason, ScoreSuggestion } from '@/utils/scoring';
import { ScoreValidationHint } from './ScoreValidationHint';

interface ScoreEntryHeaderProps {
  mainTitle: string;
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

const headerSlotClass =
  'shrink-0 border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-800 min-h-[7.25rem]';

export const ScoreEntryHeader = ({
  mainTitle,
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
}: ScoreEntryHeaderProps) => (
  <div className={headerSlotClass}>
    <AnimatePresence mode="wait" initial={false}>
      {showScoreValidation && validationReason ? (
        <motion.div
          key="validation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ScoreValidationHint
            reason={validationReason}
            detail={validationDetail}
            isRecommendation={isAutomaticRelaxed}
            suggestions={validationSuggestions}
            onApplySuggestion={onApplySuggestion}
          />
        </motion.div>
      ) : (
        <motion.div
          key="meta"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="flex items-start justify-between gap-2 pr-8">
            <DialogTitle className="mb-0 text-base font-semibold text-gray-900 dark:text-white">
              {mainTitle}
            </DialogTitle>
            {courtLabel?.trim() ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <MapPin size={11} aria-hidden />
                {courtLabel.trim()}
              </span>
            ) : null}
          </div>

          {!isSupplementalRow && descriptionLine ? (
            <DialogDescription className="mt-1 text-xs leading-snug text-gray-500 dark:text-gray-400">
              {descriptionLine}
            </DialogDescription>
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
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">{extraSetHint}</p>
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
