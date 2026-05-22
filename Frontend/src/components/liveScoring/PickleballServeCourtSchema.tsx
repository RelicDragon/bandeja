import type { ServeCourtSchemaProps } from './ServeCourtSchema';
import { PickleballCourt } from './rally/PickleballCourt';

export function PickleballServeCourtSchema({
  courtSide,
  serverTeam,
  className,
  'aria-label': ariaLabel,
}: ServeCourtSchemaProps) {
  return (
    <PickleballCourt
      teamAPlayers={[]}
      teamBPlayers={[]}
      teamAScore={0}
      teamBScore={0}
      serverTeam={serverTeam}
      courtSide={courtSide}
      className={className ?? 'h-36 w-full max-w-[9rem]'}
      aria-label={ariaLabel}
    />
  );
}
