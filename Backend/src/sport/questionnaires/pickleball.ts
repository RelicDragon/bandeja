import { scoreAnchoredQuestionnaire, scoreBySum, type AnchoredQuestionnaireSpec } from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence/knowledge questions, summed. Still scored for store
 * builds that bundle the v1 copy and submit without a `questionnaireVersion`.
 */
export const PICKLEBALL_QUESTIONNAIRE_V1_ID = 'pickleball-v1';

export const PICKLEBALL_QUESTION_KEYS_V1 = [
  'sportQuestionnaire.pickleball.q1',
  'sportQuestionnaire.pickleball.q2',
  'sportQuestionnaire.pickleball.q3',
  'sportQuestionnaire.pickleball.q4',
  'sportQuestionnaire.pickleball.q5',
] as const;

export const PICKLEBALL_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: PICKLEBALL_QUESTIONNAIRE_V1_ID,
  questionKeys: PICKLEBALL_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: PICKLEBALL_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026), same method as padel-v2 / tennis-v2. Why v1 was replaced:
 *  - q2 (kitchen rules) and half of q4 (serving order, two-bounce rule) score
 *    rules knowledge, which anyone who read the rulebook maxes out — a newcomer
 *    who knows the rules got +4–5 points over an equally skilled one who didn't;
 *  - q1 merged pickleball experience with other racket sports and nothing
 *    capped the result, so "a few sessions + knows the rules + confident" → 2.5
 *    (≈ DUPR 2.9) after a handful of games;
 *  - the third-shot drop — the skill that most separates DUPR 3.0 from 4.0 —
 *    was never asked, nor serve/return depth;
 *  - D answers described DUPR 4.0+ play (stacking, controlled dink placement)
 *    but all-D scored 3.5 ≈ DUPR 3.46, while one stray B lifted all-A to 1.5.
 * Prod (Oct 2026): 6 pickleball questionnaires ever (1.0×1, 2.0×2, 3.0×2,
 * 3.5×1), 22 profiles, 4 rated games in total — no outcome data to calibrate
 * against, so v2 is anchored to the display scale instead.
 *
 * Pickleball displays DUPR = 2.0 + (level − 1) × 3.5/6, so levels 1/2/3/4 ≈
 * DUPR 2.0 / 2.6 / 3.2 / 3.75. Skill answers A–D paraphrase the USA Pickleball
 * skill-rating descriptors at those points (2.0 new; 2.5 gets serve/return in,
 * no dinking; 3.0 consistent serve/return without depth, attempts drops and
 * dinks; 3.5–4.0 deep placed serve/return, drop good enough to reach the
 * kitchen line, patient two-sided dinking, blocks speed-ups):
 *
 *   q1 pickleball experience          → ceiling
 *   q2 tennis/padel/table tennis/etc. → small bonus (+0.25 regular, +0.5 competitive
 *                                       tennis/padel/table tennis only)
 *   q3 serve & return, q4 third shot, q5 kitchen line → A–D anchored on four rungs (scored 1.0–3.5)
 *   q6 games & results                → same anchors, weighted ×2 (hardest to inflate)
 *
 * Differences from tennis/padel, both from pickleball's racket-sport transfer:
 *  - The novice ceiling is 2.0 (≈ DUPR 2.6), not 1.5. Tennis, padel and table
 *    tennis players are typically DUPR 2.5–3.0 within their first sessions; at
 *    1.5 (≈ DUPR 2.3) they'd lose their first games against true beginners'
 *    expectations and need several wins to surface. Transfer already shows in
 *    their skill answers (a tennis player's return lands deep on day one), so
 *    the lever is the cap, not a bigger bonus — a bigger bonus would
 *    double-count. Someone who never held a racket answers A/B and still lands
 *    at 1.0–2.0.
 *  - The competitive bonus (D) is limited to tennis, padel and table tennis,
 *    whose paddle-face control, doubles net positioning and soft hands carry
 *    over; wrist-driven badminton/squash strokes carry over less, so those
 *    players top out at the regular-play answer (C, +0.25).
 *  - Experience bands are shorter (6 months / 2 years): pickleball's learning
 *    curve is shallower than tennis'.
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const PICKLEBALL_QUESTIONNAIRE_V2_ID = 'pickleball-v2';

export const PICKLEBALL_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

const PICKLEBALL_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 2.0, B: 2.5, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0.25, D: 0.5 },
  skillWeights: [1, 1, 1, 2], // q3, q4, q5, q6
};

export function scorePickleballV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, PICKLEBALL_V2_SPEC);
}

export const PICKLEBALL_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: PICKLEBALL_QUESTIONNAIRE_V2_ID,
  questionKeys: PICKLEBALL_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: PICKLEBALL_QUESTION_KEYS_V2.length,
  score: scorePickleballV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const PICKLEBALL_QUESTIONNAIRE_ID = PICKLEBALL_QUESTIONNAIRE_V1_ID;
/** @deprecated v1 alias kept for existing imports. */
export const PICKLEBALL_QUESTION_KEYS = PICKLEBALL_QUESTION_KEYS_V1;
