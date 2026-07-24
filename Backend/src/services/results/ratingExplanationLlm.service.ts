import prisma from '../../config/database';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON } from '../ai/llmReasons';
import { getOutcomeExplanation } from './outcomeExplanation.service';
import { buildRatingExplanationLlmPrompt } from './ratingExplanationLlmPrompt.util';
import { buildAlgorithmNotes } from './ratingExplanationLlmAlgorithmNotes';
import type {
  ExplanationDataForLlm,
  RatingExplanationLlmResponse,
  StoredLlmRatingExplanation,
} from './ratingExplanationLlm.types';
import {
  emptyExplanationBlob,
  isPendingFresh,
  normalizeSourceLanguage,
  readExplanationBlob,
  toStoredEntry,
  updateExplanationBlob,
} from './ratingExplanationLlmStorage';
import { canRequestRatingExplanationLlm } from './ratingExplanationLlmAccess';

export { LLM_RATING_EXPLANATION_KEY } from './ratingExplanationLlmStorage';

const sourceInFlight = new Set<string>();

function sourceFlightKey(gameId: string, userId: string): string {
  return `src:${gameId}:${userId}`;
}

function playerDisplayName(firstName?: string | null, lastName?: string | null): string {
  const name = `${firstName || ''} ${lastName || ''}`.trim();
  return name || 'Unknown';
}

function toLlmPayload(
  explanation: NonNullable<Awaited<ReturnType<typeof getOutcomeExplanation>>>,
): ExplanationDataForLlm {
  const matches = explanation.matches.map((m) => ({
    roundNumber: m.roundNumber,
    matchNumber: m.matchNumber,
    isWinner: m.isWinner,
    isDraw: m.isDraw,
    notFinishedByRules: m.notFinishedByRules,
    opponentLevel: m.opponentLevel,
    ownTeamLevel: m.ownTeamLevel,
    levelDifference: m.levelDifference,
    scoreDelta: m.scoreDelta,
    levelChange: m.levelChange,
    pointsEarned: m.pointsEarned,
    multiplier: m.multiplier,
    totalPointDifferential: m.totalPointDifferential,
    enduranceCoefficient: m.enduranceCoefficient,
    expectedWinProbability: m.expectedWinProbability,
    performanceDifference: m.performanceDifference,
    baseLevelChange: m.baseLevelChange,
    highLevelDampening: m.highLevelDampening,
    cappedByMaxDelta: m.cappedByMaxDelta,
    maxDeltaPerEvent: m.maxDeltaPerEvent,
    marginLabel: m.marginLabel,
    teammates: m.teammates.map((p) => ({
      name: playerDisplayName(p.firstName, p.lastName),
      level: p.level,
    })),
    opponents: m.opponents.map((p) => ({
      name: playerDisplayName(p.firstName, p.lastName),
      level: p.level,
    })),
    sets: m.sets?.map((s) => ({
      setNumber: s.setNumber,
      isWinner: s.isWinner,
      levelChange: s.levelChange,
      userScore: s.userScore,
      opponentScore: s.opponentScore,
      isTieBreak: s.isTieBreak,
      scoreKind: s.scoreKind,
    })),
  }));

  return {
    levelBefore: explanation.userLevel,
    levelAfter: explanation.userLevel + explanation.levelChange,
    levelChange: explanation.levelChange,
    reliabilityBefore: explanation.userReliability,
    reliabilityCoefficient: explanation.reliabilityCoefficient,
    ratingSettling: explanation.ratingSettling,
    ratingUncertainty:
      explanation.ratingUncertainty > 0 ? explanation.ratingUncertainty : undefined,
    gamesPlayedBefore: explanation.userGamesPlayed,
    summary: explanation.summary,
    placementRatingFloor: explanation.placementRatingFloor,
    algorithmNotes: buildAlgorithmNotes({
      ratingUncertainty: explanation.ratingUncertainty,
      ratingSettling: explanation.ratingSettling,
      reliabilityCoefficient: explanation.reliabilityCoefficient,
      placementRatingFloor: explanation.placementRatingFloor,
      matches,
    }),
    matches,
  };
}

async function loadOutcome(gameId: string, userId: string) {
  return prisma.gameOutcome.findUnique({
    where: { gameId_userId: { gameId, userId } },
    select: { id: true, metadata: true },
  });
}

async function mutateBlob(
  gameId: string,
  userId: string,
  updater: Parameters<typeof updateExplanationBlob>[2],
) {
  return updateExplanationBlob(
    () => loadOutcome(gameId, userId),
    async (id, metadata) => {
      await prisma.gameOutcome.update({ where: { id }, data: { metadata } });
    },
    updater,
  );
}

async function writeSource(
  gameId: string,
  userId: string,
  source: StoredLlmRatingExplanation,
  options?: { onlyIfStartedAt?: string },
): Promise<boolean> {
  const saved = await mutateBlob(gameId, userId, (current) => {
    if (options?.onlyIfStartedAt) {
      if (!current || current.source.startedAt !== options.onlyIfStartedAt) {
        return null;
      }
    }
    const entry = toStoredEntry(source);
    if (!current) return emptyExplanationBlob(entry);
    return {
      version: 2,
      source: entry,
      translations: current.translations,
    };
  });
  return saved != null;
}

async function runSourceGeneration(
  gameId: string,
  userId: string,
  language: string,
  startedAt: string,
  initiatedByUserId?: string,
): Promise<void> {
  const key = sourceFlightKey(gameId, userId);
  if (sourceInFlight.has(key)) return;
  sourceInFlight.add(key);

  const fail = async (error: string) => {
    await writeSource(
      gameId,
      userId,
      {
        status: 'failed',
        language,
        error,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { onlyIfStartedAt: startedAt },
    );
  };

  try {
    const ai = getAiService();
    if (!ai.isConfigured()) {
      await fail('AI not configured');
      return;
    }

    const explanation = await getOutcomeExplanation(gameId, userId);
    if (!explanation) {
      await fail('Outcome not found');
      return;
    }

    const payload = toLlmPayload(explanation);
    const { system, user } = buildRatingExplanationLlmPrompt(payload, language);
    const text = (
      await ai.createCompletion({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 2100,
        reason: LLM_REASON.RATING_EXPLANATION,
        userId: initiatedByUserId,
      })
    ).trim();

    if (!text) {
      await fail('Empty AI response');
      return;
    }

    await writeSource(
      gameId,
      userId,
      {
        status: 'ready',
        language,
        text,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { onlyIfStartedAt: startedAt },
    );
  } catch (error: unknown) {
    console.error('[ratingExplanationLlm] source generation failed', gameId, userId, language, error);
    await fail(error instanceof Error ? error.message : 'Generation failed');
  } finally {
    sourceInFlight.delete(key);
  }
}

function scheduleSourceGeneration(
  gameId: string,
  userId: string,
  language: string,
  startedAt: string,
  initiatedByUserId?: string,
): void {
  void runSourceGeneration(gameId, userId, language, startedAt, initiatedByUserId);
}

function toOriginalResponse(source: StoredLlmRatingExplanation): RatingExplanationLlmResponse {
  if (source.status === 'ready' && source.text) {
    return {
      status: 'ready',
      text: source.text,
      language: source.language,
      sourceLanguage: source.language,
      kind: 'original',
    };
  }
  if (source.status === 'failed') {
    return { status: 'failed', language: source.language, sourceLanguage: source.language, kind: 'original' };
  }
  return { status: 'pending', language: source.language, sourceLanguage: source.language, kind: 'original' };
}

/**
 * Ensures a single original insight exists (generated once).
 * Translations are handled separately — never regenerate for another locale.
 */
export async function getOrStartRatingExplanationLlm(
  gameId: string,
  userId: string,
  languageInput: string | undefined,
  initiatedByUserId?: string,
  options?: { retry?: boolean; allowStart?: boolean },
): Promise<RatingExplanationLlmResponse> {
  const preferredLanguage = normalizeSourceLanguage(languageInput);
  const retry = Boolean(options?.retry);
  const allowStart = Boolean(options?.allowStart);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, affectsRating: true },
  });
  if (!game) return { status: 'skipped' };
  if (!game.affectsRating) return { status: 'skipped' };

  if (!getAiService().isConfigured()) {
    return { status: 'unavailable' };
  }

  const outcome = await loadOutcome(gameId, userId);
  if (!outcome) return { status: 'skipped' };

  const blob = readExplanationBlob(outcome.metadata);
  const source = blob?.source;

  if (source?.status === 'ready' && source.text) {
    return toOriginalResponse(source);
  }

  if (!allowStart) {
    // Read-only: ready/pending only — never expose failed (broken Retry UX).
    if (source?.status === 'ready' && source.text) return toOriginalResponse(source);
    if (source && isPendingFresh(source)) return toOriginalResponse(source);
    return { status: 'skipped' };
  }

  const allowed = await canRequestRatingExplanationLlm(gameId, userId, initiatedByUserId);
  if (!allowed) {
    if (source?.status === 'ready' && source.text) return toOriginalResponse(source);
    if (source && isPendingFresh(source)) return toOriginalResponse(source);
    return { status: 'skipped' };
  }

  if (!retry && source?.status === 'failed') {
    return toOriginalResponse(source);
  }

  if (source && isPendingFresh(source)) {
    if (!sourceInFlight.has(sourceFlightKey(gameId, userId))) {
      scheduleSourceGeneration(gameId, userId, source.language, source.startedAt, initiatedByUserId);
    }
    return toOriginalResponse(source);
  }

  const startedAt = new Date().toISOString();
  const pending: StoredLlmRatingExplanation = {
    status: 'pending',
    language: preferredLanguage,
    startedAt,
  };

  // CAS: never overwrite ready or fresh pending (retry only clears failed / stale).
  const saved = await mutateBlob(gameId, userId, (current) => {
    if (current?.source.status === 'ready' && current.source.text) {
      return current;
    }
    if (current?.source && isPendingFresh(current.source)) {
      return current;
    }
    if (!retry && current?.source?.status === 'failed') {
      return current;
    }
    return emptyExplanationBlob(pending);
  });

  if (!saved) return { status: 'failed', language: preferredLanguage, kind: 'original' };

  if (saved.source.startedAt !== startedAt) {
    if (saved.source.status === 'pending' && !sourceInFlight.has(sourceFlightKey(gameId, userId))) {
      scheduleSourceGeneration(
        gameId,
        userId,
        saved.source.language,
        saved.source.startedAt,
        initiatedByUserId,
      );
    }
    return toOriginalResponse(saved.source);
  }

  scheduleSourceGeneration(gameId, userId, preferredLanguage, startedAt, initiatedByUserId);
  return toOriginalResponse(pending);
}

export function _resetRatingExplanationInFlightForTests(): void {
  sourceInFlight.clear();
}
