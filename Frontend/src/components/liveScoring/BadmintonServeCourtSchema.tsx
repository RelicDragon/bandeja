import type { ServeCourtProps } from './ServeCourtProps';
import { BadmintonCourt } from './rally/BadmintonCourt';

export function BadmintonServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  teamAPlayers,
  teamBPlayers,
  matchDoubles = false,
  courtEndsSwapped,
  endsSetup,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: ServeCourtProps) {
  void ariaLabel;
  return (
    <BadmintonCourt
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={0}
      teamBScore={0}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      courtSide={courtSide}
      matchDoubles={matchDoubles}
      courtEndsSwapped={courtEndsSwapped}
      endsSetup={endsSetup}
      motionToken={motionToken}
      className={className}
      frameStyle={frameStyle}
    />
  );
}
