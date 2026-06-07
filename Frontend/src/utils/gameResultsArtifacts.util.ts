import type { Game, GameResultsArtifacts, GameResultsArtifactsStatus } from '@/types';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { isUserGameAdminOrOwner, isUserGameParticipant } from '@/utils/gameResults';

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

const DEFAULT_PHOTO_GENERATIONS_MAX = 3;

export function normalizeGameResultsArtifacts(raw: unknown): GameResultsArtifacts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const used =
    typeof o.photoGenerationsUsed === 'number' ? o.photoGenerationsUsed : 0;
  const max =
    typeof o.photoGenerationsMax === 'number'
      ? o.photoGenerationsMax
      : DEFAULT_PHOTO_GENERATIONS_MAX;
  const remaining =
    typeof o.photoGenerationsRemaining === 'number'
      ? o.photoGenerationsRemaining
      : Math.max(0, max - used);
  return {
    status: normalizeArtifactsStatus(o.status),
    version: typeof o.version === 'number' ? o.version : 0,
    summaryReady: o.summaryReady === true,
    summaryInFlight: o.summaryInFlight === true,
    photoReady: o.photoReady === true,
    photoInFlight: o.photoInFlight === true,
    photoGenerationsUsed: used,
    photoGenerationsRemaining: remaining,
    photoGenerationsMax: max,
    readyAt: typeof o.readyAt === 'string' ? o.readyAt : null,
  };
}

export function hasCachedResultsSummary(resultsSummaryText?: string | null): boolean {
  return Boolean(resultsSummaryText?.trim());
}

export function hasGamePhotoForTelegram(game: {
  photosCount?: number;
  mainPhotoId?: string | null;
  mainPhoto?: { id: string } | null;
}): boolean {
  return (game.photosCount || 0) > 0 || Boolean(getGameMainPhotoId(game));
}

/** True when the game has finalized results suitable for Telegram delivery. */
export function hasEnteredResultsForTelegram(game: {
  resultsStatus?: string;
  outcomes?: unknown[] | null;
}): boolean {
  if (game.resultsStatus === 'FINAL') return true;
  return Boolean(game.outcomes && game.outcomes.length > 0);
}

/** Matches backend canAccessGameIncludingArchived for artifact/Telegram actions. */
export function canAccessResultsTelegramActions(
  game: Game | null | undefined,
  user: { id: string; isAdmin?: boolean } | null | undefined
): boolean {
  if (!game || !user) return false;
  if (game.resultsStatus !== 'FINAL') return false;
  if (!game.city?.telegramGroupId) return false;
  return (
    user.isAdmin === true ||
    isUserGameAdminOrOwner(game, user.id) ||
    isUserGameParticipant(game, user.id)
  );
}

export function isSummaryReadyForTelegram(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  return hasSummaryText || artifacts?.summaryReady === true;
}

export function isPhotoReadyForTelegram(
  _artifacts?: GameResultsArtifacts | null,
  hasGamePhoto = false
): boolean {
  return hasGamePhoto;
}

export function canShowPhotoGenerationAction(
  artifacts?: GameResultsArtifacts | null
): boolean {
  const remaining = artifacts?.photoGenerationsRemaining ?? DEFAULT_PHOTO_GENERATIONS_MAX;
  const inFlight = artifacts?.photoInFlight === true;
  return remaining > 0 && !inFlight;
}

export function isArtifactJobActive(artifacts?: GameResultsArtifacts | null): boolean {
  return artifacts?.status === 'pending' || artifacts?.status === 'running';
}

export function isSummaryArtifactGenerating(
  artifacts?: GameResultsArtifacts | null,
  hasSummaryText = false
): boolean {
  if (!artifacts?.summaryInFlight) return false;
  return !isSummaryReadyForTelegram(artifacts, hasSummaryText);
}

export function isPhotoArtifactGenerating(
  artifacts?: GameResultsArtifacts | null
): boolean {
  return artifacts?.photoInFlight === true;
}

export function isAnyArtifactGenerating(
  artifacts?: GameResultsArtifacts | null,
  opts: { hasSummaryText?: boolean; hasGamePhoto?: boolean } = {}
): boolean {
  return (
    isSummaryArtifactGenerating(artifacts, opts.hasSummaryText) ||
    isPhotoArtifactGenerating(artifacts)
  );
}

export function gamePhotoFieldsChanged(
  prev: Pick<Game, 'photosCount' | 'mainPhotoId' | 'mainPhoto'>,
  next: Pick<Game, 'photosCount' | 'mainPhotoId' | 'mainPhoto'>
): boolean {
  if ((next.photosCount ?? 0) !== (prev.photosCount ?? 0)) return true;
  if (next.mainPhotoId !== prev.mainPhotoId) return true;
  if ((next.mainPhoto?.id ?? null) !== (prev.mainPhoto?.id ?? null)) return true;
  return false;
}

export function shouldMergeSelfGameSocketUpdate(
  prev: Pick<Game, 'resultsArtifacts' | 'photosCount' | 'mainPhotoId' | 'mainPhoto'>,
  updated: Pick<Game, 'resultsArtifacts' | 'photosCount' | 'mainPhotoId' | 'mainPhoto'>,
  forceUpdate?: boolean
): boolean {
  if (forceUpdate) return true;
  const nextVersion = updated.resultsArtifacts?.version ?? 0;
  const prevVersion = prev.resultsArtifacts?.version ?? 0;
  if (nextVersion > prevVersion) return true;
  if (updated.resultsArtifacts?.readyAt) return true;
  return gamePhotoFieldsChanged(prev, updated);
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
