import { BasicUser } from '@/types';
import { ScoreEntryTeamPanel, type TeamSideState } from './ScoreEntryTeamPanel';
import { ScoreStepper } from './ScoreStepper';
import { TRAY_CLASS, TRAY_PLATE_CLASS } from './scoreEntryStyles';
import type { ScoreEntryLayout } from './ScoreEntryModal';

interface ScoreEntryBoardProps {
  layout: ScoreEntryLayout;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  teamAScore: number;
  teamBScore: number;
  scoreMax: number;
  pickerTeam: 'teamA' | 'teamB' | null;
  vsAriaLabel: string;
  valueAriaLabel: string;
  onTeamScoreChange: (team: 'teamA' | 'teamB', next: number) => void;
  onTogglePicker: (team: 'teamA' | 'teamB') => void;
}

const sideState = (
  team: 'teamA' | 'teamB',
  a: number,
  b: number,
): TeamSideState => {
  const own = team === 'teamA' ? a : b;
  const other = team === 'teamA' ? b : a;
  if (own > other) return 'leading';
  if (own < other) return 'trailing';
  return 'neutral';
};

const HAIRLINE_TONE = 'via-gray-900/[0.09] dark:via-white/[0.12]';

/** Vertical hairline between the two teams (portrait). */
const VsHairline = ({ ariaLabel }: { ariaLabel: string }) => (
  <div className="flex items-stretch justify-center py-1" role="img" aria-label={ariaLabel}>
    <span className={`w-px bg-gradient-to-b from-transparent to-transparent ${HAIRLINE_TONE}`} />
  </div>
);

/** Two dots centred on the score tiles; the tiles are 5.25rem tall. */
const ScoreColon = () => (
  <div className="flex h-[5.25rem] flex-col items-center justify-center gap-2.5 self-start" aria-hidden>
    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
  </div>
);

/** Horizontal hairline between the two team rows (landscape). */
const VsRule = ({ ariaLabel }: { ariaLabel: string }) => (
  <div className="flex items-center gap-3 px-2" role="img" aria-label={ariaLabel}>
    <span className={`h-px flex-1 bg-gradient-to-r from-transparent to-transparent ${HAIRLINE_TONE}`} />
    <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
    <span className={`h-px flex-1 bg-gradient-to-r from-transparent to-transparent ${HAIRLINE_TONE}`} />
  </div>
);

export const ScoreEntryBoard = ({
  layout,
  teamAPlayers,
  teamBPlayers,
  teamAScore,
  teamBScore,
  scoreMax,
  pickerTeam,
  vsAriaLabel,
  valueAriaLabel,
  onTeamScoreChange,
  onTogglePicker,
}: ScoreEntryBoardProps) => {
  const stateA = sideState('teamA', teamAScore, teamBScore);
  const stateB = sideState('teamB', teamAScore, teamBScore);

  if (layout === 'columns') {
    return (
      <div className={TRAY_CLASS}>
        <div className={`${TRAY_PLATE_CLASS} px-3 pb-3 pt-4`}>
          <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-stretch gap-x-2 gap-y-3.5">
            <ScoreEntryTeamPanel players={teamAPlayers} sideState={stateA} />
            <VsHairline ariaLabel={vsAriaLabel} />
            <ScoreEntryTeamPanel players={teamBPlayers} sideState={stateB} />

            <ScoreStepper
              value={teamAScore}
              onChange={(n) => onTeamScoreChange('teamA', n)}
              onValueClick={() => onTogglePicker('teamA')}
              max={scoreMax}
              layout="stacked"
              state={stateA}
              isActive={pickerTeam === 'teamA'}
              valueAriaLabel={valueAriaLabel}
            />
            <ScoreColon />
            <ScoreStepper
              value={teamBScore}
              onChange={(n) => onTeamScoreChange('teamB', n)}
              onValueClick={() => onTogglePicker('teamB')}
              max={scoreMax}
              layout="stacked"
              state={stateB}
              isActive={pickerTeam === 'teamB'}
              valueAriaLabel={valueAriaLabel}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={TRAY_CLASS}>
      <div className={`${TRAY_PLATE_CLASS} flex flex-col gap-2.5 p-3`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ScoreEntryTeamPanel players={teamAPlayers} sideState={stateA} orientation="row" />
          </div>
          <ScoreStepper
            value={teamAScore}
            onChange={(n) => onTeamScoreChange('teamA', n)}
            onValueClick={() => onTogglePicker('teamA')}
            max={scoreMax}
            layout="compact"
            state={stateA}
            isActive={pickerTeam === 'teamA'}
            valueAriaLabel={valueAriaLabel}
          />
        </div>

        <VsRule ariaLabel={vsAriaLabel} />

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ScoreEntryTeamPanel players={teamBPlayers} sideState={stateB} orientation="row" />
          </div>
          <ScoreStepper
            value={teamBScore}
            onChange={(n) => onTeamScoreChange('teamB', n)}
            onValueClick={() => onTogglePicker('teamB')}
            max={scoreMax}
            layout="compact"
            state={stateB}
            isActive={pickerTeam === 'teamB'}
            valueAriaLabel={valueAriaLabel}
          />
        </div>
      </div>
    </div>
  );
};
