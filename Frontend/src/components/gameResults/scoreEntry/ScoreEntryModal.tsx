import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, MapPin } from 'lucide-react';
import { Button, SegmentedSwitch } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser } from '@/types';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { ScorePickerNumberGrid } from '@/components/gameResults/ScorePickerNumberGrid';
import {
  AutomaticDeciderSetModeSwitch,
  AutomaticMatchRecordModeSwitch,
} from '@/components/gameResults/AutomaticRelaxedScoreEntryControls';
import { ScoreEntryTeamPanel } from './ScoreEntryTeamPanel';
import { ScoreStepper } from './ScoreStepper';
import { ScoreValidationHint } from './ScoreValidationHint';
import {
  useScoreEntryState,
  type ScoreEntryGame,
  type ScoreEntrySaveHandler,
} from './useScoreEntryState';

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
  onRemove?: (matchId: string, setIndex: number) => void;
  onClose: () => void;
  canRemove?: boolean;
  isOpen: boolean;
  roundNumber?: number;
}

export const ScoreEntryModal = ({
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
  isOpen,
  roundNumber,
}: ScoreEntryModalProps) => {
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
    onSave,
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
    numberOptions,
    handleNumberSelect,
    recommendation,
    suggestions,
    applySuggestion,
    handleSave,
    handleRemove,
    teamAPlayers,
    teamBPlayers,
    mainTitle,
    descriptionLine,
    showScoreValidation,
    saveDisabled,
  } = entry;

  const extraRoleTabs = useMemo(
    () => [
      { id: 'EXTRA_GAMES', label: t('gameResults.extraUnitGames') },
      { id: 'EXTRA_BALLS', label: t('gameResults.extraUnitBalls') },
    ],
    [t],
  );

  const pickerPlayers = pickerTeam === 'teamA' ? teamAPlayers : teamBPlayers;
  const pickerScore = pickerTeam === 'teamA' ? teamAScore : teamBScore;

  const renderStepper = (team: 'teamA' | 'teamB') => (
    <ScoreStepper
      value={team === 'teamA' ? teamAScore : teamBScore}
      onChange={(next) => setTeamScore(team, next)}
      onValueClick={() => setPickerTeam(team)}
      max={scoreMax}
      orientation={layout === 'columns' ? 'vertical' : 'horizontal'}
      valueAriaLabel={t('gameResults.scorePickerOtherScore')}
    />
  );

  const divider =
    layout === 'columns' ? (
      <div className="relative flex w-8 shrink-0 items-stretch justify-center self-stretch" aria-hidden>
        <div className="w-px bg-gradient-to-b from-transparent via-gray-200 to-transparent dark:via-gray-700" />
        <span className="absolute top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          {t('gameResults.vs')}
        </span>
      </div>
    ) : (
      <div className="relative flex w-full items-center justify-center py-1" aria-hidden>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-gray-700" />
        <span className="absolute rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
          {t('gameResults.vs')}
        </span>
      </div>
    );

  const scoreBody =
    layout === 'columns' ? (
      <div className="flex w-full flex-row items-stretch justify-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          <ScoreEntryTeamPanel players={teamAPlayers} isLeading={teamAScore > teamBScore} className="w-full" />
          {renderStepper('teamA')}
        </div>
        {divider}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          <ScoreEntryTeamPanel players={teamBPlayers} isLeading={teamBScore > teamAScore} className="w-full" />
          {renderStepper('teamB')}
        </div>
      </div>
    ) : (
      <div className="flex w-full flex-col items-stretch gap-1.5">
        <div className="flex w-full flex-row items-center gap-3">
          <ScoreEntryTeamPanel players={teamAPlayers} isLeading={teamAScore > teamBScore} className="min-w-0 flex-1" />
          {renderStepper('teamA')}
        </div>
        {divider}
        <div className="flex w-full flex-row items-center gap-3">
          <ScoreEntryTeamPanel players={teamBPlayers} isLeading={teamBScore > teamAScore} className="min-w-0 flex-1" />
          {renderStepper('teamB')}
        </div>
      </div>
    );

  const pickerBody = (
    <div className="flex w-full flex-col items-center gap-3">
      <ScoreEntryTeamPanel players={pickerPlayers} isLeading={false} className="w-full max-w-xs" />
      <ScorePickerNumberGrid
        numberOptions={numberOptions}
        keypadMax={scorePickerKeypadMax}
        currentScore={pickerScore}
        onSelect={handleNumberSelect}
        clampToAllowed={clampToAllowed}
        density={layout === 'columns' ? 'comfortable' : 'compact'}
        pickerResetKey={pickerTeam}
      />
      <button
        type="button"
        onClick={() => setPickerTeam(null)}
        className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
      >
        {t('common.back')}
      </button>
    </div>
  );

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="score-entry-modal">
      <DialogContent>
        <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-800">
          <div className="flex items-start justify-between gap-2 pr-8">
            <DialogTitle className="mb-0 text-base font-semibold leading-tight text-gray-900 dark:text-white sm:text-lg">
              {mainTitle}
            </DialogTitle>
            {courtLabel?.trim() ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <MapPin size={11} aria-hidden />
                {courtLabel.trim()}
              </span>
            ) : null}
          </div>
          {!isSupplementalRow && descriptionLine ? (
            <DialogDescription className="mt-1 line-clamp-2 text-xs font-medium normal-case leading-snug text-gray-500 dark:text-gray-400">
              {descriptionLine}
            </DialogDescription>
          ) : null}
          {isAutomaticRelaxed && !isSupplementalRow && setIndex === 0 ? (
            <AutomaticMatchRecordModeSwitch mode={matchRecordMode} onChange={setMatchRecordMode} />
          ) : null}
          {isAutomaticRelaxed && !isSupplementalRow && setIndex > 0 && canUseSuperTiebreak ? (
            <AutomaticDeciderSetModeSwitch
              matchRecordMode={persistedRecordMode}
              useSuperTiebreak={useSuperTiebreak}
              onChange={setUseSuperTiebreak}
            />
          ) : null}
          {isSupplementalRow ? (
            <div className="mt-1.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('gameResults.extraSetHint')}
              </p>
              <SegmentedSwitch
                tabs={extraRoleTabs}
                activeId={extraRole}
                onChange={(id) => setExtraRole(id as 'EXTRA_GAMES' | 'EXTRA_BALLS')}
                showOnlyActiveTabText={false}
                layoutId="score-entry-extra-role"
                className="mt-2"
                fullWidth
                ariaLabel={t('gameResults.extraSetHint')}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {pickerTeam ? pickerBody : scoreBody}
          {showScoreValidation && recommendation.reason ? (
            <div className="mt-3">
              <ScoreValidationHint
                reason={recommendation.reason}
                detail={recommendation.detail}
                isRecommendation={isAutomaticRelaxed}
                suggestions={suggestions}
                onApplySuggestion={applySuggestion}
              />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-row items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <Button onClick={onClose} variant="ghost" className="h-11 flex-1 rounded-xl text-sm font-semibold">
            {t('common.cancel')}
          </Button>
          {canRemove && onRemove ? (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t('common.delete')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95 dark:hover:bg-red-950/40"
            >
              <Trash2 size={17} />
            </button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={saveDisabled}
            className="h-11 flex-1 rounded-xl text-sm font-semibold shadow-sm"
          >
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
