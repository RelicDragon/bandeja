import prisma from '../../config/database';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON } from '../ai/llmReasons';
import { getOutcomeExplanation } from './outcomeExplanation.service';
import { buildRatingExplanationLlmPrompt } from './ratingExplanationLlmPrompt.util';
import type {
  ExplanationDataForLlm,
  RatingExplanationLlmResponse,
  StoredLlmRatingExplanation,
} from './ratingExplanationLlm.types';
import {
  emptyExplanationBlob,
  normalizeSourceLanguage,
  readExplanationBlob,
  toStoredEntry,
  updateExplanationBlob,
} from './ratingExplanationLlmStorage';

export { LLM_RATING_EXPLANATION_KEY } from './ratingExplanationLlmStorage';

const PENDING_STALE_MS = 90_000;
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
  return {
    levelBefore: explanation.userLevel,
    levelAfter: explanation.userLevel + explanation.levelChange,
    levelChange: explanation.levelChange,
    reliabilityBefore: explanation.userReliability,
    reliabilityAfter: explanation.userReliability + explanation.reliabilityChange,
    reliabilityChange: explanation.reliabilityChange,
    reliabilityCoefficient: explanation.reliabilityCoefficient,
    ratingSettling: explanation.ratingSettling,
    ratingUncertainty:
      explanation.ratingUncertainty > 0 ? explanation.ratingUncertainty : undefined,
    gamesPlayedBefore: explanation.userGamesPlayed,
    summary: explanation.summary,
    placementRatingFloor: explanation.placementRatingFloor,
    matches: explanation.matches.map((m) => ({
      roundNumber: m.roundNumber,
      matchNumber: m.matchNumber,
      isWinner: m.isWinner,
      isDraw: m.isDraw,
      notFinishedByRules: m.notFinishedByRules,
      opponentLevel: m.opponentLevel,
      levelDifference: m.levelDifference,
      scoreDelta: m.scoreDelta,
      levelChange: m.levelChange,
      pointsEarned: m.pointsEarned,
      multiplier: m.multiplier,
      totalPointDifferential: m.totalPointDifferential,
      enduranceCoefficient: m.enduranceCoefficient,
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
    })),
  };
}

function isPendingFresh(stored: { status: string; startedAt: string }): boolean {
  if (stored.status !== 'pending') return false;
  const started = Date.parse(stored.startedAt);
  if (Number.isNaN(started)) return false;
  return Date.now() - started < PENDING_STALE_MS;
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
  options?: { onlyIfStartedAt?: string; clearTranslations?: boolean },
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
      translations: options?.clearTranslations ? {} : current.translations,
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
        max_tokens: 700,
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

export async function getOrStartRatingExplanationLlm(
  gameId: string,
  userId: string,
  languageInput: string | undefined,
  initiatedByUserId?: string,
  options?: { retry?: boolean },
): Promise<RatingExplanationLlmResponse> {
  const preferredLanguage = normalizeSourceLanguage(languageInput);
  const retry = Boolean(options?.retry);

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

  if (!retry && source?.status === 'ready' && source.text) {
    return toOriginalResponse(source);
  }

  if (!retry && source?.status === 'failed') {
    return toOriginalResponse(source);
  }

  if (!retry && source && isPendingFresh(source)) {
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

  const saved = await mutateBlob(gameId, userId, () => emptyExplanationBlob(pending));
  if (!saved) return { status: 'skipped' };

  scheduleSourceGeneration(gameId, userId, preferredLanguage, startedAt, initiatedByUserId);
  return toOriginalResponse(pending);
}

export function _resetRatingExplanationInFlightForTests(): void {
  sourceInFlight.clear();
}
