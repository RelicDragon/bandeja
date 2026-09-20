/**
 * PRD 357 — pure availability rule behind "Move indoor".
 *
 * Split out of `indoorAlternatives.service.ts` so the "is this court free?"
 * decision can be tested against occupancy fixtures without a club, a database
 * or a provider snapshot.
 */
import {
  isOccupancyHardBlock,
  type OccupancyBlock,
} from '../game/courtOccupancy.service';

export interface IndoorAlternativeCourt {
  id: string;
  name: string;
  isFree: boolean;
  /** Why it is busy — `null` when free. Used for the screen-reader label. */
  busyKind: OccupancyBlock['kind'] | null;
}

export function blockOverlapsWindow(
  block: Pick<OccupancyBlock, 'startTime' | 'endTime'>,
  start: Date,
  end: Date,
): boolean {
  const blockStart = new Date(block.startTime).getTime();
  const blockEnd = new Date(block.endTime).getTime();
  if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) return false;
  return blockStart < end.getTime() && blockEnd > start.getTime();
}

/**
 * Maps club courts + occupancy blocks to the sheet's rows.
 *
 * A court is busy when an overlapping block is a **hard** block (a club booking
 * or a blocking admin hold) or another app game. Blocks belonging to
 * `excludeGameId` are ignored, so a game already partly indoors still sees its
 * own court as free rather than "busy with itself".
 */
export function selectIndoorAlternatives(params: {
  courts: readonly { id: string; name: string }[];
  blocks: readonly OccupancyBlock[];
  start: Date;
  end: Date;
  excludeGameId?: string;
}): IndoorAlternativeCourt[] {
  const busyByCourt = new Map<string, OccupancyBlock['kind']>();

  for (const block of params.blocks) {
    if (!block.courtId) continue;
    if (params.excludeGameId && block.gameId === params.excludeGameId) continue;
    if (!blockOverlapsWindow(block, params.start, params.end)) continue;
    if (!isOccupancyHardBlock(block) && block.kind !== 'game') continue;
    if (!busyByCourt.has(block.courtId)) busyByCourt.set(block.courtId, block.kind);
  }

  return params.courts.map((court) => ({
    id: court.id,
    name: court.name,
    isFree: !busyByCourt.has(court.id),
    busyKind: busyByCourt.get(court.id) ?? null,
  }));
}
