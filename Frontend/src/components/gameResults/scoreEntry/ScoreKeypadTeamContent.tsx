import { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import { ScorePickerNumberGrid } from '@/components/gameResults/ScorePickerNumberGrid';

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
      <div className="mb-2 flex min-w-0 items-center gap-2 pr-9">
        <div className="flex shrink-0 -space-x-2">
          {players.map((player) => (
            <PlayerAvatar
              key={player.id}
              player={player}
              inlineFace
              inlineFacePlain
              inlineFaceFlatStack
              showName={false}
              draggable={false}
            />
          ))}
        </div>
        <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
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
