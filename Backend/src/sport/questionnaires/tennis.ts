import { scoreAnchoredQuestionnaire, scoreBySum, type AnchoredQuestionnaireSpec } from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence-style questions ("how confident / comfortable…"), summed.
 * Still scored for store builds that bundle the v1 copy and submit without a
 * `questionnaireVersion`.
 */
export const TENNIS_QUESTIONNAIRE_V1_ID = 'tennis-v1';

export const TENNIS_QUESTION_KEYS_V1 = [
  'sportQuestionnaire.tennis.q1',
  'sportQuestionnaire.tennis.q2',
  'sportQuestionnaire.tennis.q3',
  'sportQuestionnaire.tennis.q4',
  'sportQuestionnaire.tennis.q5',
] as const;

export const TENNIS_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: TENNIS_QUESTIONNAIRE_V1_ID,
  questionKeys: TENNIS_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: TENNIS_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026), same method as padel-v2. Why v1 was replaced:
 *  - confidence wording ("How confident are you with your serve…") invites
 *    inflation and doesn't separate adjacent levels;
 *  - q1 mixed tennis experience with other racket sports, and nothing capped
 *    the result: a padel player brand new to tennis who answered "comfortable"
 *    elsewhere got 3.5;
 *  - q5 asked about rules/scoring knowledge, which a TV viewer maxes out;
 *  - the D answers described NTRP 4.0–4.5 play (spin, placement, overheads)
 *    but all-D scored 3.5 ≈ NTRP 3.0, while one stray B lifted all-A to 1.5 —
 *    answer texts were not anchored to the level they produced.
 * Prod (Oct 2026): 22 tennis questionnaires (2.0×6, 2.5×6, 3.0×6, 3.5×4) and
 * zero rated tennis games, so there is no outcome data to calibrate against;
 * v2 is anchored to the display scale instead.
 *
 * Tennis displays NTRP = 1.5 + (level − 1) × 4/6, so levels 1/2/3/4 ≈ NTRP
 * 1.5 / 2.0–2.5 / 3.0 / 3.5. Skill answers A–D paraphrase the USTA NTRP general
 * characteristics at exactly those points:
 *
 *   q1 tennis experience           → ceiling (< 1 year can't be NTRP 3.0)
 *   q2 padel/squash/other racket   → small bonus (+0.25 regular, +0.5 competitive)
 *   q3 groundstrokes, q4 serve, q5 net → A–D anchored on four rungs (scored 1.0–3.5)
 *   q6 matches & results           → same anchors, weighted ×2 (hardest to inflate)
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const TENNIS_QUESTIONNAIRE_V2_ID = 'tennis-v2';

export const TENNIS_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

const TENNIS_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 1.5, B: 2.0, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0.25, D: 0.5 },
  skillWeights: [1, 1, 1, 2], // q3, q4, q5, q6
};

export function scoreTennisV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, TENNIS_V2_SPEC);
}

export const TENNIS_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: TENNIS_QUESTIONNAIRE_V2_ID,
  questionKeys: TENNIS_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: TENNIS_QUESTION_KEYS_V2.length,
  score: scoreTennisV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const TENNIS_QUESTIONNAIRE_ID = TENNIS_QUESTIONNAIRE_V1_ID;
/** @deprecated v1 alias kept for existing imports. */
export const TENNIS_QUESTION_KEYS = TENNIS_QUESTION_KEYS_V1;
