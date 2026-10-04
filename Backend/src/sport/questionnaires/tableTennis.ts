import { scoreAnchoredQuestionnaire, scoreBySum, type AnchoredQuestionnaireSpec } from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence/knowledge questions, summed. Still scored for store
 * builds that bundle the v1 copy and submit without a `questionnaireVersion`.
 */
export const TABLE_TENNIS_QUESTIONNAIRE_V1_ID = 'table-tennis-v1';

export const TABLE_TENNIS_QUESTION_KEYS_V1 = [
  'sportQuestionnaire.tableTennis.q1',
  'sportQuestionnaire.tableTennis.q2',
  'sportQuestionnaire.tableTennis.q3',
  'sportQuestionnaire.tableTennis.q4',
  'sportQuestionnaire.tableTennis.q5',
] as const;

export const TABLE_TENNIS_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: TABLE_TENNIS_QUESTIONNAIRE_V1_ID,
  questionKeys: TABLE_TENNIS_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: TABLE_TENNIS_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026), same method as padel-v2 / tennis-v2 / pickleball-v2 /
 * badminton-v2. Why v1 was replaced:
 *  - there was no experience question: q1 mixed "have you played" with grip
 *    and stroke self-assessment, and it never excluded casual ping-pong
 *    (garage, office, holiday), which nearly everyone has played and which
 *    never meets spin. A casual player honestly answers "I can rally with both
 *    forehand and backhand" (C) and "medium-paced rallies with reasonable
 *    control" (C) — the summed score put such a player at 2.5–3.0
 *    (≈ USATT 1150–1270, a solid club player) with nothing capping it;
 *  - spin, the skill that separates basement from club table tennis, was only
 *    touched in confidence terms ("How confident are you with serve and
 *    receive?"); serve and receive — a third of all points — shared one
 *    question, and reading spin was never asked on its own;
 *  - q4 scored rules knowledge (scoring, lets, service order), which reading
 *    the rulebook maxes out;
 *  - D answers described USATT 1600+ play (varied serve spin, reading returns,
 *    loops with varied spin) but all-D scored 3.5 ≈ USATT 1380, while one
 *    stray B lifted all-A to 1.5.
 * Prod (Oct 2026): 11 table tennis questionnaires ever, all v1 (2.0×1,
 * 2.5×4, 3.0×4, 3.5×2) — nobody below 2.0 (≈ USATT 1030), two of eleven at the
 * v1 maximum; 44 profiles, zero table tennis games — no outcome data to
 * calibrate against, so v2 is anchored to the display scale instead.
 *
 * Table tennis displays USATT = 800 + (level − 1) × 1400/6, so levels 1/2/3/4
 * ≈ USATT 800 / 1030 / 1270 / 1500. Skill answers A–D paraphrase the usual
 * USATT rating descriptors at those points: < 800 flat hitting, spin from the
 * other side ends the rally; ~1000 forehand/backhand drive rallies, pushes
 * backspin, simple spin serves, heavy spin still beats them; ~1250 pushes
 * consistently, low backspin/sidespin serves, returns most serves, forehand
 * loop against backspin, blocks some loops; ~1500 loops backspin and topspin
 * on the forehand, opens up on the backhand, blocks most loops, varies serve
 * length and spin to set up a third-ball attack, reads most serves:
 *
 *   q1 club/league/coached table tennis → ceiling (casual ping-pong excluded;
 *                                          < 1 year can't be ≈ USATT 1270+)
 *   q2 tennis/badminton/squash/etc.      → competitive only: +0.25
 *   q3 rallying, q4 serving, q5 receiving spin, q6 topspin attack & blocking
 *                                        → A–D anchored on four rungs (scored 1.0–3.5)
 *   q7 games & results                   → same anchors, weighted ×2
 *                                          (hardest to inflate)
 *
 * Seven questions, not six: receiving spin gets its own question because it is
 * the skill casual players overrate most — they have never faced a heavy
 * backspin or sidespin serve, so they can't know it would beat them, and they
 * tend to answer the rally question too generously.
 *
 * Racket-sport transfer to table tennis is the weakest of all our sports: the
 * tiny bat, the reaction time at 2.7 m and spin dominating every exchange mean
 * tennis/padel swing habits (big backswing, firm wrist) mostly need
 * unlearning, and squash/badminton wrist speed helps reflexes but not reading
 * spin. So the novice cap stays at 1.5 (as tennis/badminton; pickleball's 2.0
 * would be wrong here), regular play elsewhere (C) earns nothing, and only a
 * competitive background (D, any racket sport) earns +0.25 — enough to tip a
 * borderline answer set up half a step (e.g. 2.33 → 2.5), never to lift a
 * whole band. Real transfer already shows in the skill answers.
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const TABLE_TENNIS_QUESTIONNAIRE_V2_ID = 'table-tennis-v2';

export const TABLE_TENNIS_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;

const TABLE_TENNIS_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 1.5, B: 2.0, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0, D: 0.25 },
  skillWeights: [1, 1, 1, 1, 2], // q3, q4, q5, q6, q7
};

export function scoreTableTennisV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, TABLE_TENNIS_V2_SPEC);
}

export const TABLE_TENNIS_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: TABLE_TENNIS_QUESTIONNAIRE_V2_ID,
  questionKeys: TABLE_TENNIS_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: TABLE_TENNIS_QUESTION_KEYS_V2.length,
  score: scoreTableTennisV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const TABLE_TENNIS_QUESTIONNAIRE_ID = TABLE_TENNIS_QUESTIONNAIRE_V1_ID;
/** @deprecated v1 alias kept for existing imports. */
export const TABLE_TENNIS_QUESTION_KEYS = TABLE_TENNIS_QUESTION_KEYS_V1;
