import type { ServeCourtProps } from './ServeCourtProps';
import { PickleballCourt } from './rally/PickleballCourt';

export function PickleballServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  teamAPlayers,
  teamBPlayers,
  matchDoubles = false,
  courtEndsSwapped,
  courtTeamASidesMirrored,
  courtTeamBSidesMirrored,
  endsSetup,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: ServeCourtProps) {
  return (
    <PickleballCourt
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={0}
      teamBScore={0}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      courtSide={courtSide}
      matchDoubles={matchDoubles}
      courtEndsSwapped={courtEndsSwapped}
      courtTeamASidesMirrored={courtTeamASidesMirrored}
      courtTeamBSidesMirrored={courtTeamBSidesMirrored}
      endsSetup={endsSetup}
      motionToken={motionToken}
      className={className}
      frameStyle={frameStyle}
      aria-label={ariaLabel}
    />
  );
}
