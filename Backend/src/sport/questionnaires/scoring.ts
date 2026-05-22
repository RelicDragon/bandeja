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
