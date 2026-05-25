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

export type ResultsArtifactsTelegramUiState =
  | 'ready'
  | 'preparing'
  | 'failed_degraded'
  | 'failed'
  | 'waiting';

export function hasCachedResultsSummary(resultsSummaryText?: string | null): boolean {
  return Boolean(resultsSummaryText?.trim());
}

export function resolveResultsArtifactsTelegramUiState(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): ResultsArtifactsTelegramUiState {
  if (!artifacts) return 'ready';

  if (artifacts.readyAt) return 'ready';

  if (artifacts.status === 'pending' || artifacts.status === 'running') {
    return 'preparing';
  }

  if (artifacts.status === 'failed') {
    return artifacts.summaryReady || hasSummaryText ? 'failed_degraded' : 'failed';
  }

  if (artifacts.status === 'done') return 'ready';

  if (hasSummaryText) return 'ready';

  return 'preparing';
}

export function isResultsArtifactsPreparing(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  return resolveResultsArtifactsTelegramUiState(artifacts, hasSummaryText) === 'preparing';
}

export function isResultsArtifactsReadyForTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  return canSendResultsToTelegram(artifacts, hasSummaryText);
}

export function canSendResultsToTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  const state = resolveResultsArtifactsTelegramUiState(artifacts, hasSummaryText);
  return state === 'ready' || state === 'failed_degraded';
}

export function isResultsArtifactsFailed(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  const state = resolveResultsArtifactsTelegramUiState(artifacts, hasSummaryText);
  return state === 'failed' || state === 'failed_degraded';
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
