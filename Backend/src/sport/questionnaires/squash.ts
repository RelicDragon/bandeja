import { scoreAnchoredQuestionnaire, scoreBySum, type AnchoredQuestionnaireSpec } from './scoring';
import type { SportQuestionnaireConfig } from './types';

/**
 * v1: five confidence/knowledge questions, summed. Still scored for store
 * builds that bundle the v1 copy and submit without a `questionnaireVersion`.
 */
export const SQUASH_QUESTIONNAIRE_V1_ID = 'squash-v1';

export const SQUASH_QUESTION_KEYS_V1 = [
  'sportQuestionnaire.squash.q1',
  'sportQuestionnaire.squash.q2',
  'sportQuestionnaire.squash.q3',
  'sportQuestionnaire.squash.q4',
  'sportQuestionnaire.squash.q5',
] as const;

export const SQUASH_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: SQUASH_QUESTIONNAIRE_V1_ID,
  questionKeys: SQUASH_QUESTION_KEYS_V1,
  answerOptions: 'ABCD',
  minQuestions: SQUASH_QUESTION_KEYS_V1.length,
  score: scoreBySum,
};

/**
 * v2 (Oct 2026), same method as padel-v2 / tennis-v2 / pickleball-v2 /
 * badminton-v2 / table-tennis-v2. Why v1 was replaced:
 *  - q1 put squash and other racket sports on one ladder ("tried squash a few
 *    times or come from another racket sport") and nothing capped the result:
 *    a tennis player who had never been on a squash court, answering
 *    generously elsewhere, summed to 3.5 (≈ SquashLevels 1370, an above-average
 *    league player). Its C/D answers were confidence ("know the basics",
 *    "feel comfortable on court");
 *  - q4 scored rules knowledge (scoring, lets and strokes, match format),
 *    which reading the rulebook maxes out;
 *  - q2 asked about returning to the T — every player believes they do, and
 *    it can't be observed from your own side of the rally;
 *  - the skills that separate a beginner from a 500 player — keeping the ball
 *    above the tin, getting it back out of the back corners — were never asked,
 *    and there was no results question although squash has the most
 *    structured club competition of all our sports (box leagues, ladders);
 *  - D answers described 2000+ play (anticipation, "controlling the front
 *    court") but all-D scored 3.5, while one stray B lifted all-A to 1.5.
 * Prod (Oct 2026): 17 squash profiles, 3 questionnaires ever (2.0, 2.5, 3.0 ≈
 * SquashLevels 670 / 900 / 1130), 3 skipped, no external hints, zero squash
 * games — no outcome data to calibrate against, so v2 is anchored to the
 * display scale instead.
 *
 * Squash displays SquashLevels = 200 + (level − 1) × 2800/6, so levels 1/2/3/4
 * ≈ SquashLevels 200 / 670 / 1130 / 1600. SquashLevels' own "how good is good"
 * guide: < 100 beginner, 500 played for a while, 1000 average team/league
 * player, 2500 A-grade tournaments. Skill answers A–D describe those points:
 * ~200 hits the tin, rallies of a few shots, can't retrieve off the back wall;
 * ~650 rallies from mid-court but length comes back into the middle, scrapes
 * balls out of the back corners, drops hit the tin (bottom box divisions);
 * ~1100 forehand length to the back near the side wall, backhand deep but
 * loose, returns most balls from the back corners with a drive or a boast,
 * volleys to cut off length, a straight drop that mostly stays low (middle box
 * divisions, lower club teams); ~1600 tight length on both sides including on
 * the volley, chooses drive/cross/boast from either back corner, tight drops
 * and counter-drops, lob to recover (top box divisions, club team in a county
 * league):
 *
 *   q1 squash experience          → ceiling (< 1 year can't be ≈ SquashLevels 1130+)
 *   q2 other racket sports        → small bonus (+0.25 regular, +0.5 competitive
 *                                   racketball, badminton or tennis only)
 *   q3 length, q4 back corners, q5 volleys & front court
 *                                 → A–D anchored on four rungs (scored 1.0–3.5)
 *   q6 games & results            → same anchors, weighted ×2 (hardest to inflate)
 *
 * Movement to the T, serve and rules are not asked: movement shows up in
 * whether you get balls back from the corners and the front (q4/q5), the serve
 * barely separates club levels, and rules max out by reading.
 *
 * Novice cap stays at 1.5 (as tennis/badminton/table tennis, not pickleball's
 * 2.0): squash is the hardest of our sports to walk into. The ball is dead
 * until warmed, a tin replaces the net, and getting the ball back off the back
 * wall and out of the corners is a skill no other sport teaches — strong
 * tennis players routinely lose to 500-level squash players on day one.
 * Transfer is partial: racketball (same court, same angles), badminton
 * (wrist-led strokes, lunging to the corners) and tennis (drive mechanics,
 * competitive match play) carry over most, so only they earn the competitive
 * bonus; padel and other racket sports top out at regular (C). Padel's glass
 * walls teach a little about rebounds, but the ball, stroke and pace differ.
 *
 * Level = weighted skill mean + bonus, rounded DOWN to 0.5, capped by q1,
 * clamped to 1.0–3.5 (see V2_SKILL_ANCHORS in scoring.ts: the answer texts
 * below describe four rungs, scored A 1.0 / B ≈1.83 / C ≈2.67 / D 3.5 because
 * in the live pool 3.0 is already a strong player). 3.5 needs the q1 "more
 * than 2 years" answer; under 2 years caps at 3.0. Stronger players climb
 * with wins (Elo max 0.2/game); an overrated starter loses and spoils games.
 */
export const SQUASH_QUESTIONNAIRE_V2_ID = 'squash-v2';

export const SQUASH_QUESTION_KEYS_V2 = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

const SQUASH_V2_SPEC: AnchoredQuestionnaireSpec = {
  experienceCap: { A: 1.5, B: 2.0, C: 3.0, D: 3.5 },
  racketBonus: { A: 0, B: 0, C: 0.25, D: 0.5 },
  skillWeights: [1, 1, 1, 2], // q3, q4, q5, q6
};

export function scoreSquashV2(answers: string[]): number {
  return scoreAnchoredQuestionnaire(answers, SQUASH_V2_SPEC);
}

export const SQUASH_QUESTIONNAIRE_V2: SportQuestionnaireConfig = {
  id: SQUASH_QUESTIONNAIRE_V2_ID,
  questionKeys: SQUASH_QUESTION_KEYS_V2,
  answerOptions: 'ABCD',
  minQuestions: SQUASH_QUESTION_KEYS_V2.length,
  score: scoreSquashV2,
};

/** @deprecated v1 alias kept for existing imports. */
export const SQUASH_QUESTIONNAIRE_ID = SQUASH_QUESTIONNAIRE_V1_ID;
/** @deprecated v1 alias kept for existing imports. */
export const SQUASH_QUESTION_KEYS = SQUASH_QUESTION_KEYS_V1;
