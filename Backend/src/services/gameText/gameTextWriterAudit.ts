import { Prisma } from '@prisma/client';

/**
 * Production Backend writers of Game.name / Game.description.
 *
 * Authored paths MUST call applyGameTextSourceChangeInTransaction in the SAME
 * transaction as the Game row write. Generated fixture labels must not AI-enqueue;
 * they record structured nameProvenance instead.
 *
 * Keep this list current when adding writers (grep: game.create / game.update with name/description).
 */
export const GAME_TEXT_AUTHORED_WRITERS = [
  'Backend/src/services/game/create.service.ts',
  'Backend/src/services/game/update.service.ts',
  'Backend/src/services/league/create.service.ts#createLeague (LEAGUE_SEASON Game.name)',
] as const;

/** Generated English fixture labels — helper with nameProvenance generated_fixture, enqueueJobs false. */
export const GAME_TEXT_GENERATED_WRITERS = [
  'Backend/src/services/league/gameCreation.util.ts#createLeagueGame',
  'Backend/src/services/league/gameCreation.util.ts#createLeaguePlayoffGame',
] as const;

export const GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE = 'generated_fixture' as const;

export type GameTextNameProvenance = typeof GAME_TEXT_NAME_PROVENANCE_GENERATED_FIXTURE | 'authored';

export function gameTextMetadataWithNameProvenance(
  existing: unknown,
  nameProvenance: GameTextNameProvenance,
): Prisma.InputJsonObject {
  const base: Prisma.InputJsonObject =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Prisma.InputJsonObject) }
      : {};
  const prevGameText =
    base.gameText && typeof base.gameText === 'object' && !Array.isArray(base.gameText)
      ? { ...(base.gameText as Prisma.InputJsonObject) }
      : {};
  return {
    ...base,
    gameText: {
      ...prevGameText,
      nameProvenance,
    },
  };
}
