import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Match } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { ScoreEntryHeader } from './ScoreEntryHeader';
import { ScoreEntryFooter } from './ScoreEntryFooter';
import { ScoreEntryBoard } from './ScoreEntryBoard';
import { ScoreKeypadPanel } from './ScoreKeypadPanel';
import {
  useScoreEntryState,
  type ScoreEntryGame,
  type ScoreEntrySaveHandler,
} from './useScoreEntryState';
import {
  scheduleScrollToRevealBottom,
  scrollToRevealBottom,
} from './scoreEntryKeypadScroll';

export type ScoreEntryLayout = 'stacked' | 'columns';

interface ScoreEntryModalProps {
  match: Match;
  setIndex: number;
  players: BasicUser[];
  layout: ScoreEntryLayout;
  courtLabel?: string | null;
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  fixedNumberOfSets?: number;
  ballsInGames?: boolean;
  game?: ScoreEntryGame | null;
  onSave: ScoreEntrySaveHandler;
  onRemove?: (matchId: string, setIndex: number, baseVersion: string | null) => void;
  onClose: () => void;
  canRemove?: boolean;
  isOpen: boolean;
  roundNumber?: number;
  matchNumber?: number;
  /** Open the number keypad for team A right away. Defaults to on. */
  autoOpenKeypad?: boolean;
  /**
   * Save, then let the caller move this dialog to the next score. The dialog
   * stays open; its body is keyed by match/set so the next draft starts fresh.
   */
  onSaveAndNext?: ScoreEntrySaveHandler;
  isAdvancing?: boolean;
}

function scrollWithinContainer(
  container: HTMLElement,
  target: HTMLElement,
  edge: 'top' | 'bottom',
  padding = 8,
) {
  if (edge === 'bottom') {
    scrollToRevealBottom(container, target, padding, 'smooth');
    return;
  }
  const c = container.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const overflow = t.top - c.top - padding;
  if (overflow < 0) {
    container.scrollBy({ top: overflow, behavior: 'smooth' });
  }
}

const BODY_MOTION = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const },
};

export const ScoreEntryModal = ({ isOpen, onClose, ...bodyProps }: ScoreEntryModalProps) => (
  <Dialog open={isOpen} onClose={onClose} modalId="score-entry-modal">
    <DialogContent className="gap-0 overflow-hidden p-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${bodyProps.match.id}-${bodyProps.setIndex}`}
          {...BODY_MOTION}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ScoreEntryBody {...bodyProps} onClose={onClose} />
        </motion.div>
      </AnimatePresence>
    </DialogContent>
  </Dialog>
);

type ScoreEntryBodyProps = Omit<ScoreEntryModalProps, 'isOpen'>;

const ScoreEntryBody = ({
  match,
  setIndex,
  players,
  layout,
  courtLabel,
  maxTotalPointsPerSet,
  maxPointsPerTeam,
  fixedNumberOfSets,
  ballsInGames = false,
  game,
  onSave,
  onRemove,
  onClose,
  canRemove = false,
  roundNumber,
  matchNumber,
  autoOpenKeypad = true,
  onSaveAndNext,
  isAdvancing = false,
}: ScoreEntryBodyProps) => {
  const { t } = useTranslation();
  const entry = useScoreEntryState({
    match,
    setIndex,
    players,
    game,
    maxTotalPointsPerSet,
    maxPointsPerTeam,
    fixedNumberOfSets,
    ballsInGames,
    roundNumber,
    matchNumber,
    autoOpenKeypad,
    onSave,
    onSaveAndNext,
    onClose,
    onRemove,
  });

  const {
    isSupplementalRow,
    isAutomaticRelaxed,
    extraRole,
    setExtraRole,
    teamAScore,
    teamBScore,
    setTeamScore,
    matchRecordMode,
    setMatchRecordMode,
    persistedRecordMode,
    canUseSuperTiebreak,
    useSuperTiebreak,
    setUseSuperTiebreak,
    pickerTeam,
    setPickerTeam,
    scoreMax,
    scorePickerKeypadMax,
    clampToAllowed,
    teamANumberOptions,
    teamBNumberOptions,
    handleNumberSelect,
    recommendation,
    suggestions,
    applySuggestion,
    handleSave,
    handleRemove,
    teamAPlayers,
    teamBPlayers,
    mainTitle,
    contextLine,
    descriptionLine,
    showScoreValidation,
    saveDisabled,
    saveAndNextDisabled,
  } = entry;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scoreboardRef = useRef<HTMLDivElement>(null);
  const keypadPanelRef = useRef<HTMLDivElement>(null);
  const scrollBeforeKeypadRef = useRef(0);
  const prevPickerTeamRef = useRef<'teamA' | 'teamB' | null>(null);
  const cancelKeypadScrollRef = useRef<(() => void) | null>(null);

  const revealKeypad = useCallback(() => {
    const container = scrollContainerRef.current;
    const panel = keypadPanelRef.current;
    if (!container || !panel) return;
    cancelKeypadScrollRef.current?.();
    cancelKeypadScrollRef.current = scheduleScrollToRevealBottom(container, panel);
  }, []);

  const restoreScoreboardScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const board = scoreboardRef.current;
    if (!container) return;
    if (board) {
      scrollWithinContainer(container, board, 'top');
      return;
    }
    container.scrollTo({ top: scrollBeforeKeypadRef.current, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const prev = prevPickerTeamRef.current;
    if (pickerTeam && !prev) {
      scrollBeforeKeypadRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    }
    prevPickerTeamRef.current = pickerTeam;
  }, [pickerTeam]);

  // A keypad that is open from the start skips its enter animation, so reveal it here.
  const initialPickerTeamRef = useRef(pickerTeam);
  useEffect(() => {
    if (initialPickerTeamRef.current) revealKeypad();
  }, [revealKeypad]);

  useEffect(() => {
    return () => {
      cancelKeypadScrollRef.current?.();
      cancelKeypadScrollRef.current = null;
    };
  }, []);

  const handleKeypadOpenComplete = useCallback(() => {
    revealKeypad();
  }, [revealKeypad]);

  const handleTeamSlideComplete = useCallback(() => {
    revealKeypad();
  }, [revealKeypad]);

  const handleKeypadExitComplete = useCallback(() => {
    requestAnimationFrame(restoreScoreboardScroll);
  }, [restoreScoreboardScroll]);

  const extraRoleTabs = useMemo(
    () => [
      { id: 'EXTRA_GAMES', label: t('gameResults.extraUnitGames') },
      { id: 'EXTRA_BALLS', label: t('gameResults.extraUnitBalls') },
    ],
    [t],
  );

  const togglePicker = (team: 'teamA' | 'teamB') =>
    setPickerTeam(pickerTeam === team ? null : team);

  const showSaveAndNext = Boolean(onSaveAndNext) && !isSupplementalRow;

  return (
    <>
      <ScoreEntryHeader
        mainTitle={mainTitle}
        contextLine={contextLine}
        descriptionLine={descriptionLine}
        courtLabel={courtLabel}
        isSupplementalRow={isSupplementalRow}
        isAutomaticRelaxed={isAutomaticRelaxed}
        setIndex={setIndex}
        canUseSuperTiebreak={canUseSuperTiebreak}
        matchRecordMode={matchRecordMode}
        persistedRecordMode={persistedRecordMode}
        useSuperTiebreak={useSuperTiebreak}
        extraRole={extraRole}
        extraRoleTabs={extraRoleTabs}
        extraSetHint={t('gameResults.extraSetHint')}
        onMatchRecordModeChange={setMatchRecordMode}
        onSuperTiebreakChange={setUseSuperTiebreak}
        onExtraRoleChange={setExtraRole}
        showScoreValidation={showScoreValidation}
        validationReason={recommendation.reason}
        validationDetail={recommendation.detail}
        validationSuggestions={suggestions}
        onApplySuggestion={applySuggestion}
      />

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 scroll-smooth overflow-y-auto overscroll-contain px-4 pb-4"
      >
        <div ref={scoreboardRef}>
          <ScoreEntryBoard
            layout={layout}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            teamAScore={teamAScore}
            teamBScore={teamBScore}
            scoreMax={scoreMax}
            pickerTeam={pickerTeam}
            vsAriaLabel={t('gameResults.vs')}
            valueAriaLabel={t('gameResults.scorePickerOtherScore')}
            onTeamScoreChange={setTeamScore}
            onTogglePicker={togglePicker}
          />
        </div>

        <div>
          <AnimatePresence initial={false} onExitComplete={handleKeypadExitComplete}>
            {pickerTeam ? (
              <ScoreKeypadPanel
                ref={keypadPanelRef}
                key="score-keypad"
                activeTeam={pickerTeam}
                teamAPlayers={teamAPlayers}
                teamBPlayers={teamBPlayers}
                teamANumberOptions={teamANumberOptions}
                teamBNumberOptions={teamBNumberOptions}
                teamAScore={teamAScore}
                teamBScore={teamBScore}
                keypadMax={scorePickerKeypadMax}
                onSelect={handleNumberSelect}
                clampToAllowed={clampToAllowed}
                density={layout === 'columns' ? 'comfortable' : 'compact'}
                onClose={() => setPickerTeam(null)}
                onOpenComplete={handleKeypadOpenComplete}
                onTeamSlideComplete={handleTeamSlideComplete}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <ScoreEntryFooter
        cancelLabel={t('common.cancel')}
        saveLabel={t('common.save')}
        deleteLabel={t('common.delete')}
        saveDisabled={saveDisabled}
        canRemove={canRemove && Boolean(onRemove)}
        onCancel={onClose}
        onSave={() => handleSave()}
        onRemove={onRemove ? handleRemove : undefined}
        saveAndNextLabel={showSaveAndNext ? t('gameResults.saveAndNext') : undefined}
        saveAndNextDisabled={saveAndNextDisabled}
        onSaveAndNext={showSaveAndNext ? () => handleSave(true) : undefined}
        isAdvancing={isAdvancing}
      />
    </>
  );
};
