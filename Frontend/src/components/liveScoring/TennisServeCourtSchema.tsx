import type { ServeCourtProps } from './ServeCourtProps';
import { TennisCourt } from './rally/TennisCourt';

export function TennisServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  motionToken,
  teamAPlayers,
  teamBPlayers,
  courtEndsSwapped,
  courtTeamASidesMirrored,
  courtTeamBSidesMirrored,
  endsSetup,
  matchDoubles = false,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: ServeCourtProps) {
  return (
    <TennisCourt
      courtSide={courtSide}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      motionToken={motionToken}
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      courtEndsSwapped={courtEndsSwapped}
      courtTeamASidesMirrored={courtTeamASidesMirrored}
      courtTeamBSidesMirrored={courtTeamBSidesMirrored}
      endsSetup={endsSetup}
      matchDoubles={matchDoubles}
      className={className}
      frameStyle={frameStyle}
      aria-label={ariaLabel}
    />
  );
}
