import {
  scoreAnchoredQuestionnaire,
  scoreBySum,
  sumAnswerScores,
  validateAnswers,
  type AnchoredQuestionnaireSpec,
} from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence-style questions, summed. Still scored for store builds
 * that bundle the v1 copy and submit without a `questionnaireVersion`.
 */
export const PADEL_QUESTIONNAIRE_V1_ID = 'padel-v1';

export const PADEL_QUESTION_KEYS_V1 = [
  'welcome.q1',
  'welcome.q2',
  'welcome.q3',
  'welcome.q4',
  'welcome.q5',
] as const;

export const PADEL_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: PADEL_QUESTIONNAIRE_V1_ID,
  questionKeys: PADEL_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: PADEL_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026). Prod showed v1 overrating: 1.5–3.5 starters all lost ~0.3 in
 * their first five rated games and 1.0–2.0 starters converged to the same level.
 * v2 asks observable, Playtomic-anchored behaviour instead of confidence:
 *
 *   q1 padel experience       → ceiling (a handful of sessions can't be 3.0)
 *   q2 other racket sports    → small bonus (+0.25 regular, +0.5 competitive)
 *   q3 rally, q4 glass, q5 net → A–D anchored on four rungs (scored 1.0–3.5)
 *   q6 matches & results      → same anchors, weighted ×2 (hardest to inflate)
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const PADEL_QUESTIONNAIRE_V2_ID = 'padel-v2';

export const PADEL_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

const PADEL_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 1.5, B: 2.0, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0.25, D: 0.5 },
  skillWeights: [1, 1, 1, 2], // q3, q4, q5, q6
};

export function scorePadelV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, PADEL_V2_SPEC);
}

export const PADEL_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: PADEL_QUESTIONNAIRE_V2_ID,
  questionKeys: PADEL_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: PADEL_QUESTION_KEYS_V2.length,
  score: scorePadelV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const PADEL_QUESTIONNAIRE_ID = PADEL_QUESTIONNAIRE_V1_ID;

export const scoreQuestionnaireAnswers = sumAnswerScores;

export function validatePadelQuestionnaireAnswers(answers: unknown): string[] {
  return validateAnswers(answers, PADEL_QUESTION_KEYS_V1.length);
}
