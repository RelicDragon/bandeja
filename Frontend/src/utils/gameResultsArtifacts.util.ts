import type { Game, GameResultsArtifacts, GameResultsArtifactsStatus } from '@/types';

const ARTIFACT_STATUSES: GameResultsArtifactsStatus[] = [
  'none',
  'pending',
  'running',
  'done',
  'failed',
];

function normalizeArtifactsStatus(raw: unknown): GameResultsArtifactsStatus {
  if (typeof raw === 'string' && ARTIFACT_STATUSES.includes(raw as GameResultsArtifactsStatus)) {
    return raw as GameResultsArtifactsStatus;
  }
  return 'none';
}

export function normalizeGameResultsArtifacts(raw: unknown): GameResultsArtifacts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  return {
    status: normalizeArtifactsStatus(o.status),
    version: typeof o.version === 'number' ? o.version : 0,
    summaryReady: o.summaryReady === true,
    photoReady: o.photoReady === true,
    readyAt: typeof o.readyAt === 'string' ? o.readyAt : null,
  };
}

export type TelegramResultsCta = 'send' | 'prepare' | 'preparing';

/** @deprecated Use resolveTelegramResultsCta */
export type ResultsArtifactsTelegramUiState =
  | 'ready'
  | 'preparing'
  | 'failed_degraded'
  | 'failed'
  | 'waiting';

export function hasCachedResultsSummary(resultsSummaryText?: string | null): boolean {
  return Boolean(resultsSummaryText?.trim());
}

export function hasGamePhotoForTelegram(game: {
  photosCount?: number;
  mainPhotoId?: string | null;
}): boolean {
  return (game.photosCount || 0) > 0 || Boolean(game.mainPhotoId);
}

export function areArtifactsPipelineComplete(artifacts?: GameResultsArtifacts | null): boolean {
  return Boolean(artifacts?.readyAt);
}

export function isSummaryReadyForTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  return hasSummaryText || artifacts?.summaryReady === true;
}

/** Job photo step done, or a photo is already on the game (e.g. AI photo before job finalizes). */
export function isPhotoReadyForTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasGamePhoto = false
): boolean {
  return hasGamePhoto || artifacts?.photoReady === true;
}

export function isArtifactJobActive(artifacts?: GameResultsArtifacts | null): boolean {
  return artifacts?.status === 'pending' || artifacts?.status === 'running';
}

/**
 * Send: pipeline ready, or summary+photo satisfied (incl. photo on game while job runs),
 * or no job but game already has photo + summary.
 * Prepare: (re)start artifact generation.
 * Preparing: job running and summary or photo still missing from UI perspective.
 */
export function resolveTelegramResultsCta(
  artifacts?: GameResultsArtifacts | null,
  opts: { hasSummaryText: boolean; hasGamePhoto: boolean } = {
    hasSummaryText: false,
    hasGamePhoto: false,
  }
): TelegramResultsCta {
  const summaryReady = isSummaryReadyForTelegram(artifacts, opts.hasSummaryText);
  const photoReady = isPhotoReadyForTelegram(artifacts, opts.hasGamePhoto);

  if (areArtifactsPipelineComplete(artifacts)) {
    return 'send';
  }

  if (summaryReady && photoReady) {
    return 'send';
  }

  if ((!artifacts || artifacts.status === 'none') && opts.hasGamePhoto && summaryReady) {
    return 'send';
  }

  if (artifacts?.status === 'failed') {
    return summaryReady && photoReady ? 'send' : 'prepare';
  }

  if (isArtifactJobActive(artifacts)) {
    if (!summaryReady || !photoReady) {
      return 'preparing';
    }
    return 'send';
  }

  return 'prepare';
}

/** @deprecated Use resolveTelegramResultsCta */
export function resolveResultsArtifactsTelegramUiState(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false,
  hasGamePhoto = false
): ResultsArtifactsTelegramUiState {
  const cta = resolveTelegramResultsCta(artifacts, {
    hasSummaryText,
    hasGamePhoto,
  });
  if (cta === 'send') return 'ready';
  if (cta === 'preparing') return 'preparing';
  if (artifacts?.status === 'failed' && isSummaryReadyForTelegram(artifacts, hasSummaryText)) {
    return 'failed_degraded';
  }
  if (artifacts?.status === 'failed') return 'failed';
  return 'waiting';
}

export function isResultsArtifactsPreparing(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false,
  hasGamePhoto = false
): boolean {
  return (
    resolveTelegramResultsCta(artifacts, { hasSummaryText, hasGamePhoto }) === 'preparing'
  );
}

export function canSendResultsToTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false,
  hasGamePhoto = false
): boolean {
  return resolveTelegramResultsCta(artifacts, { hasSummaryText, hasGamePhoto }) === 'send';
}

export function isResultsArtifactsReadyForTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false,
  hasGamePhoto = false
): boolean {
  return canSendResultsToTelegram(artifacts, hasSummaryText, hasGamePhoto);
}

export function isResultsArtifactsFailed(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  return artifacts?.status === 'failed' && !isSummaryReadyForTelegram(artifacts, hasSummaryText);
}

export function mergeGameResultsArtifactsFields(prev: Game, next: Game): Game {
  const nextArtifacts = next.resultsArtifacts;
  const prevArtifacts = prev.resultsArtifacts;
  if (!nextArtifacts && !prevArtifacts) return next;

  const mergedArtifacts =
    nextArtifacts && prevArtifacts && nextArtifacts.version < prevArtifacts.version
      ? prevArtifacts
      : nextArtifacts ?? prevArtifacts;

  const nextSummary = next.resultsSummaryText?.trim() || null;
  const prevSummary = prev.resultsSummaryText?.trim() || null;

  return {
    ...next,
    resultsArtifacts: mergedArtifacts,
    resultsSummaryText: nextSummary ?? prevSummary ?? next.resultsSummaryText,
  };
}
