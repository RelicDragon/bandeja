import type { ServeCourtProps } from './ServeCourtProps';
import { SquashCourt } from './rally/SquashCourt';

export function SquashServeCourtSchema({
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
    <SquashCourt
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
