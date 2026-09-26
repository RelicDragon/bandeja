import { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import { ScorePickerNumberGrid } from '@/components/gameResults/ScorePickerNumberGrid';
import { FACE_CUTOUT_CLASS } from './scoreEntryStyles';

interface ScoreKeypadTeamContentProps {
  players: BasicUser[];
  numberOptions: number[];
  keypadMax: number;
  currentScore: number;
  onSelect: (n: number) => void;
  clampToAllowed: (value: number) => number;
  density: 'comfortable' | 'compact';
  teamKey: 'teamA' | 'teamB';
}

const playerShortLabel = (player: BasicUser) => {
  const first = player.firstName?.trim();
  const last = player.lastName?.trim();
  if (first && last) return first;
  if (first) return first;
  if (last) return last;
  return '?';
};

const teamHeaderLabel = (players: BasicUser[]) =>
  players.map(playerShortLabel).join(' · ');

export function ScoreKeypadTeamContent({
  players,
  numberOptions,
  keypadMax,
  currentScore,
  onSelect,
  clampToAllowed,
  density,
  teamKey,
}: ScoreKeypadTeamContentProps) {
  return (
    <>
      <div className="mb-2 flex min-h-8 min-w-0 items-center gap-2.5 ps-1.5 pe-10">
        <div className="flex shrink-0 -space-x-2">
          {players.map((player) => (
            <span key={player.id} className={`${FACE_CUTOUT_CLASS} ring-gray-50 dark:ring-gray-900`}>
              <PlayerAvatar
                player={player}
                inlineFace
                inlineFacePlain
                inlineFaceFlatStack
                showName={false}
                draggable={false}
              />
            </span>
          ))}
        </div>
        <span className="truncate text-[13px] font-semibold tracking-[-0.005em] text-gray-800 dark:text-gray-100">
          {teamHeaderLabel(players)}
        </span>
      </div>
      <ScorePickerNumberGrid
        numberOptions={numberOptions}
        keypadMax={keypadMax}
        currentScore={currentScore}
        onSelect={onSelect}
        clampToAllowed={clampToAllowed}
        density={density}
        pickerResetKey={teamKey}
      />
    </>
  );
}
