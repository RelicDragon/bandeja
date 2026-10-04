export const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;
export type AnswerOption = (typeof VALID_ANSWERS)[number];

const ANSWER_POINTS: Record<AnswerOption, number> = { A: 1, B: 2, C: 3, D: 4 };

/** Shared band: total score 5–20 → level 1.0–3.5 (padel welcome + 5-question sport questionnaires). */
export function scoreToLevel(totalScore: number): number {
  if (totalScore === 5) return 1.0;
  if (totalScore >= 6 && totalScore <= 8) return 1.5;
  if (totalScore >= 9 && totalScore <= 11) return 2.0;
  if (totalScore >= 12 && totalScore <= 14) return 2.5;
  if (totalScore >= 15 && totalScore <= 17) return 3.0;
  if (totalScore >= 18 && totalScore <= 20) return 3.5;
  return 1.0;
}

/** Four-question sports: total score 4–16 → same 1.0–3.5 band (proportional steps). */
export function scoreToLevelFourQuestions(totalScore: number): number {
  if (totalScore === 4) return 1.0;
  if (totalScore >= 5 && totalScore <= 6) return 1.5;
  if (totalScore >= 7 && totalScore <= 8) return 2.0;
  if (totalScore >= 9 && totalScore <= 10) return 2.5;
  if (totalScore >= 11 && totalScore <= 12) return 3.0;
  if (totalScore >= 13 && totalScore <= 16) return 3.5;
  return 1.0;
}

export function sumAnswerScores(answers: string[]): number {
  return answers.reduce((sum, a) => sum + (ANSWER_POINTS[a as AnswerOption] ?? 0), 0);
}

/** v1 scoring: A–D summed (1–4 points each) and banded by `scoreToLevel`. */
export function scoreBySum(answers: string[]): number {
  return scoreToLevel(sumAnswerScores(answers));
}

/**
 * v2-style anchored questionnaire: answers are `[experience, racketBackground, ...skills]`.
 *
 * Every v2 questionnaire tops out at 3.5: in the live pool 3.0 is already a strong
 * player and 3.5 means 2+ years of regular play. Skill answers are spread evenly
 * over that range — A 1.0, B ≈1.83, C ≈2.67, D 3.5 — so all-B → 1.5, all-C → 2.5,
 * all-D → 3.5 (prod padel v1 starters converged to ~1.6–1.9 low, ~2.4 mid,
 * ~2.8 top after 20+ rated games).
 * Level = weighted skill mean + racket bonus, rounded DOWN to 0.5, capped by
 * experience (3.5 only for the "2+ years" answer), clamped to 1.0–3.5.
 */
export const V2_MIN_LEVEL = 1.0;
export const V2_MAX_LEVEL = 3.5;

export const V2_SKILL_ANCHORS: Record<AnswerOption, number> = {
  A: 1.0,
  B: 1.0 + 2.5 / 3,
  C: 1.0 + 5 / 3,
  D: 3.5,
};

export type AnchoredQuestionnaireSpec = {
  experienceCap: Record<AnswerOption, number>;
  racketBonus: Record<AnswerOption, number>;
  /** One weight per skill question, in order; missing weights default to 1. */
  skillWeights: readonly number[];
};

export function scoreAnchoredQuestionnaire(answers: string[], spec: AnchoredQuestionnaireSpec): number {
  const [experience, racket, ...skills] = answers as AnswerOption[];
  let weighted = 0;
  let weightSum = 0;
  skills.forEach((a, i) => {
    const w = spec.skillWeights[i] ?? 1;
    weighted += V2_SKILL_ANCHORS[a] * w;
    weightSum += w;
  });
  const skill = weighted / weightSum + spec.racketBonus[racket];
  // Float guard so e.g. 2.0 + 0.5 bonus doesn't floor to 2.0 via 2.4999….
  const rounded = Math.floor(skill * 2 + 1e-9) / 2;
  const capped = Math.min(rounded, spec.experienceCap[experience]);
  return Math.max(V2_MIN_LEVEL, Math.min(V2_MAX_LEVEL, capped));
}

export function validateAnswers(answers: unknown, expectedCount: number): string[] {
  if (!Array.isArray(answers) || answers.length !== expectedCount) {
    throw new Error(`Exactly ${expectedCount} answers are required`);
  }
  const out: string[] = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (typeof a !== 'string' || !VALID_ANSWERS.includes(a as AnswerOption)) {
      throw new Error(`Invalid answer at question ${i + 1}: must be A, B, C, or D`);
    }
    out.push(a);
  }
  return out;
}
