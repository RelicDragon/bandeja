import { scoreAnchoredQuestionnaire, scoreBySum, type AnchoredQuestionnaireSpec } from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence/knowledge questions, summed. Still scored for store
 * builds that bundle the v1 copy and submit without a `questionnaireVersion`.
 */
export const BADMINTON_QUESTIONNAIRE_V1_ID = 'badminton-v1';

export const BADMINTON_QUESTION_KEYS_V1 = [
  'sportQuestionnaire.badminton.q1',
  'sportQuestionnaire.badminton.q2',
  'sportQuestionnaire.badminton.q3',
  'sportQuestionnaire.badminton.q4',
  'sportQuestionnaire.badminton.q5',
] as const;

export const BADMINTON_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: BADMINTON_QUESTIONNAIRE_V1_ID,
  questionKeys: BADMINTON_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: BADMINTON_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026), same method as padel-v2 / tennis-v2 / pickleball-v2. Why v1
 * was replaced:
 *  - q1 mixed badminton experience with other racket sports on one ladder and
 *    nothing capped the result: "played a few times" plus confident answers
 *    elsewhere summed to 3.5. It also never excluded garden/beach/school-PE
 *    badminton, which most people have played and which teaches none of the
 *    court game (overhead clear, low serve, net shots);
 *  - q5 scored rules knowledge (scoring, service courts, lets, service order)
 *    and q4 half-scored doubles-rotation knowledge — both maxed out by reading,
 *    not by playing;
 *  - the overhead attack (smash/drop) and defending smashes — what most
 *    separates improver from intermediate club play — were never asked;
 *  - confidence wording ("confidently", "comfortable", "reasonable depth");
 *  - D answers described league players (deception, controlling the net) but
 *    all-D scored 3.5, while one stray B lifted all-A to 1.5.
 * Prod (Oct 2026): 5 badminton questionnaires ever (1.5, 2.0, 3.0, 3.5×2 — two
 * of five at the v1 maximum), 32 profiles, zero rated badminton games — no
 * outcome data to calibrate against.
 *
 * Badminton has no external display scale (display system NONE), so levels
 * 1/2/3/4 are anchored to the app's own band starts — Beginner / Improver /
 * Intermediate / Advanced — paraphrasing the usual club-grading ladder
 * (e.g. Badminton England club levels): can't clear past mid-court → forehand
 * clear over the net but short, high serve, lifts → forehand clear to the back
 * consistently, overhead drop and smash, reliable low serve, net shots near
 * the tape → clears from both rear corners, steep smash vs fast drop by
 * choice, blocks smashes to the net, tight net play = league/club-team standard.
 *
 *   q1 badminton on a real court  → ceiling (< 1 year can't be Intermediate)
 *   q2 squash/tennis/other racket → small bonus (+0.25 regular, +0.5 competitive
 *                                   squash or tennis only)
 *   q3 clears from the back, q4 smash/drop & defence, q5 serve & net
 *                                 → A–D anchored on four rungs (scored 1.0–3.5)
 *   q6 games & results            → same anchors, weighted ×2 (hardest to inflate)
 *
 * Unlike pickleball (novice cap 2.0), badminton keeps the tennis/padel novice
 * cap of 1.5: racket-sport transfer is weak. The shuttle's flight and the
 * wrist/forearm overhead stroke are unique, and tennis/padel swing habits
 * (stiff wrist, long follow-through) need unlearning, so an experienced racket
 * player new to badminton does not reach the back of the court on day one.
 * Squash (wrist-led strokes, lunging footwork) and tennis (overhead throwing
 * action, competitive match play) transfer most, so only they earn the
 * competitive bonus; other competitive racket players top out at regular (C).
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const BADMINTON_QUESTIONNAIRE_V2_ID = 'badminton-v2';

export const BADMINTON_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

const BADMINTON_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 1.5, B: 2.0, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0.25, D: 0.5 },
  skillWeights: [1, 1, 1, 2], // q3, q4, q5, q6
};

export function scoreBadmintonV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, BADMINTON_V2_SPEC);
}

export const BADMINTON_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: BADMINTON_QUESTIONNAIRE_V2_ID,
  questionKeys: BADMINTON_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: BADMINTON_QUESTION_KEYS_V2.length,
  score: scoreBadmintonV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const BADMINTON_QUESTIONNAIRE_ID = BADMINTON_QUESTIONNAIRE_V1_ID;
/** @deprecated v1 alias kept for existing imports. */
export const BADMINTON_QUESTION_KEYS = BADMINTON_QUESTION_KEYS_V1;
