import { Swords } from 'lucide-react';
import { BasicUser } from '@/types';
import { ScoreEntryTeamPanel, type TeamSideState } from './ScoreEntryTeamPanel';
import { ScoreStepper } from './ScoreStepper';
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

const VsDivider = ({ ariaLabel }: { ariaLabel: string }) => (
  <div
    className="flex items-center justify-center self-center px-0.5"
    role="img"
    aria-label={ariaLabel}
  >
    <Swords size={14} className="text-gray-400 dark:text-gray-500" aria-hidden />
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
      <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-x-2 gap-y-3">
          <ScoreEntryTeamPanel players={teamAPlayers} sideState={stateA} />
          <VsDivider ariaLabel={vsAriaLabel} />
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
          <div className="flex items-center justify-center self-center" aria-hidden>
            <span className="text-xl font-light text-gray-300 dark:text-gray-600">:</span>
          </div>
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
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ScoreEntryTeamPanel players={teamAPlayers} sideState={stateA} showNames={false} />
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

        <div className="flex items-center justify-center py-0.5">
          <VsDivider ariaLabel={vsAriaLabel} />
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ScoreEntryTeamPanel players={teamBPlayers} sideState={stateB} showNames={false} />
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
