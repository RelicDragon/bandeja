import type { ServeCourtProps } from './ServeCourtProps';
import { TableTennisCourt } from './rally/TableTennisCourt';

export function TableTennisServeCourtSchema({
  serverTeam,
  serverPlayerIndex,
  teamAPlayers,
  teamBPlayers,
  matchDoubles = false,
  courtSide,
  courtEndsSwapped,
  endsSetup,
  motionToken,
  className,
  frameStyle,
  'aria-label': ariaLabel,
}: ServeCourtProps) {
  return (
    <TableTennisCourt
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
      aria-label={ariaLabel}
    />
  );
}
