import { normalizeAppUiLanguage, type AppUiLanguage } from '@bandeja/app-locale';
import prisma from '../../config/database';
import { isGameTextLocalizationGenerationEnabled } from '../../config/env';
import {
  resolveGameLocalizedText,
  type GameTextFieldsInFlight,
} from './gameTextLocalizedText.resolve';
import type {
  GameLocalizedTextProjection,
  GameTextSourceMetaForResolve,
  GameTextTranslationRowForResolve,
} from './gameTextLocalizedText.types';

export type GameLocalizedTextBatchMaps = {
  locale: AppUiLanguage;
  metaByGameId: Map<string, GameTextSourceMetaForResolve>;
  rowsByGameId: Map<string, GameTextTranslationRowForResolve[]>;
  /** Pending/running jobs for the batch locale, keyed by game id. */
  activeJobsByGameId: Map<string, GameTextActiveJobForResolve[]>;
};

export type GameTextActiveJobForResolve = {
  includeName: boolean;
  includeDescription: boolean;
  nameSourceRevision: number;
  descriptionSourceRevision: number;
};

/** Which fields still have queued work at the current source revisions. */
export function gameTextFieldsInFlight(
  meta: GameTextSourceMetaForResolve | null | undefined,
  jobs: readonly GameTextActiveJobForResolve[] | null | undefined,
): GameTextFieldsInFlight {
  const nameRevision = meta?.nameSourceRevision ?? 0;
  const descriptionRevision = meta?.descriptionSourceRevision ?? 0;
  const list = jobs ?? [];
  return {
    name: list.some(
      (j) => j.includeName && j.nameSourceRevision === nameRevision,
    ),
    description: list.some(
      (j) =>
        j.includeDescription && j.descriptionSourceRevision === descriptionRevision,
    ),
  };
}

type GameLikeForIds = {
  id?: string | null;
  parentId?: string | null;
  parent?: {
    id?: string | null;
    leagueSeason?: { game?: { id?: string | null } | null } | null;
  } | null;
  leagueSeason?: { game?: { id?: string | null } | null } | null;
};

/** Collect game + nested parent/season game ids for one batch load. */
export function collectGameIdsForLocalizedText(
  games: readonly GameLikeForIds[],
): string[] {
  const ids = new Set<string>();
  for (const game of games) {
    if (game?.id) ids.add(game.id);
    if (game?.parentId) ids.add(game.parentId);
    if (game?.parent?.id) ids.add(game.parent.id);
    const parentSeasonGameId = game?.parent?.leagueSeason?.game?.id;
    if (parentSeasonGameId) ids.add(parentSeasonGameId);
    const seasonGameId = game?.leagueSeason?.game?.id;
    if (seasonGameId) ids.add(seasonGameId);
  }
  return [...ids];
}

/**
 * Batch-load source meta + translation rows for many games at one locale.
 * No per-card queries.
 */
export async function loadGameLocalizedTextBatch(
  gameIds: readonly string[],
  localeInput: string | null | undefined,
): Promise<GameLocalizedTextBatchMaps> {
  const locale = normalizeAppUiLanguage(localeInput);
  const uniqueIds = [...new Set(gameIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {
      locale,
      metaByGameId: new Map(),
      rowsByGameId: new Map(),
      activeJobsByGameId: new Map(),
    };
  }

  // Generation off → queued jobs never run; nothing counts as in flight.
  const generationEnabled = isGameTextLocalizationGenerationEnabled();

  const [metas, translations, activeJobs] = await Promise.all([
    prisma.gameTextSourceMeta.findMany({
      where: { gameId: { in: uniqueIds } },
      select: {
        gameId: true,
        nameSourceRevision: true,
        descriptionSourceRevision: true,
        keepOriginalNameInAllLocales: true,
      },
    }),
    prisma.gameTextTranslation.findMany({
      where: { gameId: { in: uniqueIds }, locale },
      select: {
        gameId: true,
        field: true,
        locale: true,
        sourceRevision: true,
        automaticText: true,
        generationState: true,
        provenance: true,
        manualOverrideText: true,
        manualOverrideSourceRevision: true,
      },
    }),
    generationEnabled
      ? prisma.gameTextTranslationJob.findMany({
          where: {
            gameId: { in: uniqueIds },
            targetLocale: locale,
            status: { in: ['pending', 'running'] },
          },
          select: {
            gameId: true,
            includeName: true,
            includeDescription: true,
            nameSourceRevision: true,
            descriptionSourceRevision: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const metaByGameId = new Map<string, GameTextSourceMetaForResolve>();
  for (const meta of metas) {
    metaByGameId.set(meta.gameId, {
      nameSourceRevision: meta.nameSourceRevision,
      descriptionSourceRevision: meta.descriptionSourceRevision,
      keepOriginalNameInAllLocales: meta.keepOriginalNameInAllLocales,
    });
  }

  const rowsByGameId = new Map<string, GameTextTranslationRowForResolve[]>();
  for (const row of translations) {
    const list = rowsByGameId.get(row.gameId) ?? [];
    list.push({
      field: row.field,
      locale: row.locale,
      sourceRevision: row.sourceRevision,
      automaticText: row.automaticText,
      generationState: row.generationState,
      provenance: row.provenance,
      manualOverrideText: row.manualOverrideText,
      manualOverrideSourceRevision: row.manualOverrideSourceRevision,
    });
    rowsByGameId.set(row.gameId, list);
  }

  const activeJobsByGameId = new Map<string, GameTextActiveJobForResolve[]>();
  for (const job of activeJobs) {
    const list = activeJobsByGameId.get(job.gameId) ?? [];
    list.push({
      includeName: job.includeName,
      includeDescription: job.includeDescription,
      nameSourceRevision: job.nameSourceRevision,
      descriptionSourceRevision: job.descriptionSourceRevision,
    });
    activeJobsByGameId.set(job.gameId, list);
  }

  return { locale, metaByGameId, rowsByGameId, activeJobsByGameId };
}

export type AttachLocalizedTextOptions = {
  /** Find cards omit authored description; skip description resolution. Default true. */
  includeDescription?: boolean;
};

type TextHost = {
  id: string;
  name?: string | null;
  description?: string | null;
  localizedText?: GameLocalizedTextProjection;
};

function projectForHost(
  host: TextHost,
  batch: GameLocalizedTextBatchMaps,
  includeDescription: boolean,
): GameLocalizedTextProjection {
  const meta = batch.metaByGameId.get(host.id) ?? null;
  return resolveGameLocalizedText({
    locale: batch.locale,
    name: host.name,
    description: includeDescription ? host.description : null,
    meta,
    rows: batch.rowsByGameId.get(host.id) ?? null,
    includeDescription,
    inFlight: gameTextFieldsInFlight(meta, batch.activeJobsByGameId.get(host.id)),
  });
}

function attachOnNestedHosts(
  game: Record<string, unknown>,
  batch: GameLocalizedTextBatchMaps,
  includeDescription: boolean,
): void {
  const parent = game.parent as TextHost | null | undefined;
  if (parent?.id) {
    parent.localizedText = projectForHost(parent, batch, includeDescription);
    const parentLs = (parent as { leagueSeason?: { game?: TextHost | null } | null })
      .leagueSeason;
    if (parentLs?.game?.id) {
      parentLs.game.localizedText = projectForHost(
        parentLs.game,
        batch,
        includeDescription,
      );
    }
  }
  const leagueSeason = game.leagueSeason as
    | { game?: TextHost | null }
    | null
    | undefined;
  if (leagueSeason?.game?.id) {
    leagueSeason.game.localizedText = projectForHost(
      leagueSeason.game,
      batch,
      includeDescription,
    );
  }
}

/**
 * Attach additive `localizedText` on each game (and nested parent/season game hosts).
 * Leaves `name` / `description` as authored originals.
 */
export async function attachLocalizedTextToGames<T extends GameLikeForIds & TextHost>(
  games: T[],
  localeInput: string | null | undefined,
  options?: AttachLocalizedTextOptions,
): Promise<T[]> {
  if (games.length === 0) return games;
  const includeDescription = options?.includeDescription !== false;
  const ids = collectGameIdsForLocalizedText(games);
  const batch = await loadGameLocalizedTextBatch(ids, localeInput);

  for (const game of games) {
    game.localizedText = projectForHost(game, batch, includeDescription);
    attachOnNestedHosts(game as unknown as Record<string, unknown>, batch, includeDescription);
  }
  return games;
}

/**
 * Same attach for card payload lists that upstream projections type as `unknown[]`
 * (Find / My pages). Returns the same array instances, mutated in place.
 */
export async function attachLocalizedTextToGameCards(
  games: unknown[],
  localeInput: string | null | undefined,
  options?: AttachLocalizedTextOptions,
): Promise<unknown[]> {
  return attachLocalizedTextToGames(
    games as (GameLikeForIds & TextHost)[],
    localeInput,
    options,
  );
}

export async function attachLocalizedTextToGame<T extends GameLikeForIds & TextHost>(
  game: T,
  localeInput: string | null | undefined,
  options?: AttachLocalizedTextOptions,
): Promise<T> {
  const [attached] = await attachLocalizedTextToGames([game], localeInput, options);
  return attached;
}
