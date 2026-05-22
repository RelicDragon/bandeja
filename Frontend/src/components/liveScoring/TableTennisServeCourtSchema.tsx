import type { ServeCourtSchemaProps } from './ServeCourtSchema';
import { TableTennisCourt } from './rally/TableTennisCourt';

export function TableTennisServeCourtSchema({
  serverTeam,
  serverPlayerIndex,
  teamAPlayers,
  teamBPlayers,
  className,
  'aria-label': ariaLabel,
}: ServeCourtSchemaProps) {
  return (
    <TableTennisCourt
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      teamAScore={0}
      teamBScore={0}
      serverTeam={serverTeam}
      serverPlayerIndex={serverPlayerIndex}
      className={className ?? 'h-28 w-full max-w-[14rem]'}
      aria-label={ariaLabel}
    />
  );
}
