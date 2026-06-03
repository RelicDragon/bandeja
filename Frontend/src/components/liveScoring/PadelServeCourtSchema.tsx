import type { ServeCourtProps } from './ServeCourtProps';
import { PadelCourt } from './rally/PadelCourt';

export function PadelServeCourtSchema({
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
    <PadelCourt
      courtSide={courtSide}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      motionToken={motionToken}
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={0}
      teamBScore={0}
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
