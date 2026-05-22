import type { ServeCourtSchemaProps } from './ServeCourtSchema';
import { BadmintonCourt } from './rally/BadmintonCourt';

export function BadmintonServeCourtSchema({
  courtSide,
  serverTeam,
  serverPlayerIndex,
  teamAPlayers,
  teamBPlayers,
  className,
  'aria-label': ariaLabel,
}: ServeCourtSchemaProps) {
  return (
    <BadmintonCourt
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={0}
      teamBScore={0}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      courtSide={courtSide}
      className={className ?? 'h-36 w-full max-w-[9rem]'}
      aria-label={ariaLabel}
    />
  );
}
