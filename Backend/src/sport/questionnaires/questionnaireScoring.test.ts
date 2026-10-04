/**
 * Questionnaire scoring + version resolution. Pure — no DB.
 *
 * The rules the product depends on: every v2 questionnaire tops out at 3.5, only
 * for 2+ years of play, and never overrates (round down, experience ceiling), and unversioned submissions from store builds are
 * still scored with the v1 set they actually showed.
 */

import { Sport } from '@prisma/client';
import {
  BADMINTON_QUESTIONNAIRE_V1,
  BADMINTON_QUESTIONNAIRE_V2,
  PADEL_QUESTIONNAIRE_V1,
  PADEL_QUESTIONNAIRE_V2,
  PICKLEBALL_QUESTIONNAIRE_V1,
  PICKLEBALL_QUESTIONNAIRE_V2,
  SQUASH_QUESTIONNAIRE_V1,
  SQUASH_QUESTIONNAIRE_V2,
  TABLE_TENNIS_QUESTIONNAIRE_V1,
  TABLE_TENNIS_QUESTIONNAIRE_V2,
  TENNIS_QUESTIONNAIRE_V1,
  TENNIS_QUESTIONNAIRE_V2,
  resolveSubmittedQuestionnaire,
  scoreBadmintonV2,
  scorePadelV2,
  scorePickleballV2,
  scoreSquashV2,
  scoreTableTennisV2,
  scoreTennisV2,
} from './index';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const v2 = (s: string) => scorePadelV2(s.split(''));
const t2 = (s: string) => scoreTennisV2(s.split(''));
const p2 = (s: string) => scorePickleballV2(s.split(''));
const b2 = (s: string) => scoreBadmintonV2(s.split(''));
const tt2 = (s: string) => scoreTableTennisV2(s.split(''));
const sq2 = (s: string) => scoreSquashV2(s.split(''));

// ---------------------------------------------------------------------------
// padel v2
// ---------------------------------------------------------------------------

{
  assert(v2('AAAAAA') === 1.0, 'padel: never played, misses everything → 1.0');
  assert(v2('DABBBB') === 1.5, 'padel: all-B skills → 1.5');
  assert(v2('DACCCC') === 2.5, 'padel: all-C skills → 2.5');
  assert(v2('DADDDD') === 3.5, 'padel: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(v2('DDDDDD') === 3.5, 'padel: racket bonus cannot exceed 3.5');
  // (2.67*3 + 2*3.5)/5 = 3.17 → 3.0: 3.5 needs top answers everywhere, incl. results.
  assert(v2('DADDDC') === 3.0, 'padel: one C keeps a strong player at 3.0');
  // (1.83*2 + 2.67 + 2*1.83)/5 = 2.0.
  assert(v2('DABBCB') === 2.0, 'padel: one stronger skill lifts half a step at most');
  // (2.67*3 + 2*1.83)/5 = 2.33 → 2.0: weak results pull strong self-described skills down.
  assert(v2('DACCCB') === 2.0, 'padel: results answer weighs double');
  assert(v2('DAAAAB') === 1.0, 'padel: one stray B does not lift a beginner (v1 gave 1.5)');
  assert(v2('CADDDD') === 3.0, 'padel: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(v2('CDDDDD') === 3.0, 'padel: racket bonus does not break the experience cap');
  assert(v2('BDAAAA') === 1.5, 'padel: competitive racket background, all-A → 1.5');
  assert(v2('BCAAAA') === 1.0, 'padel: regular racket background alone rounds away');
  assert(v2('BDBBBB') === 2.0, 'padel: competitive racket background lifts all-B to 2.0');
  assert(v2('CCCCCC') === 2.5, 'padel: +0.25 regular bonus does not round all-C up');
  assert(v2('DDCCCC') === 3.0, 'padel: +0.5 competitive bonus lifts all-C to 3.0');
  assert(v2('AADDDD') === 1.5, 'padel: a handful of sessions caps at 1.5');
  assert(v2('BADDDD') === 2.0, 'padel: < 6 months caps at 2.0');
  assert(v2('ADCCCC') === 1.5, 'padel: never-played tennis player still capped at 1.5');
}

// ---------------------------------------------------------------------------
// padel v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(PADEL_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'v1 all-A → 1.0');
  assert(PADEL_QUESTIONNAIRE_V1.score(['B', 'B', 'B', 'B', 'B']) === 2.0, 'v1 all-B → 2.0');
  assert(PADEL_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// tennis v2
// ---------------------------------------------------------------------------

{
  assert(t2('AAAAAA') === 1.0, 'tennis: never played, misses everything → 1.0');
  assert(t2('DABBBB') === 1.5, 'tennis: all-B skills → 1.5');
  assert(t2('DACCCC') === 2.5, 'tennis: all-C skills → 2.5');
  assert(t2('DADDDD') === 3.5, 'tennis: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(t2('DDDDDD') === 3.5, 'tennis: racket bonus cannot exceed 3.5');
  // (2.67*3 + 2*3.5)/5 = 3.17 → 3.0: 3.5 needs top answers everywhere, incl. results.
  assert(t2('DADDDC') === 3.0, 'tennis: one C keeps a strong player at 3.0');
  // (1.83*2 + 2.67 + 2*1.83)/5 = 2.0.
  assert(t2('DABBCB') === 2.0, 'tennis: one stronger skill lifts half a step at most');
  // (2.67*3 + 2*1.83)/5 = 2.33 → 2.0: weak results pull strong self-described skills down.
  assert(t2('DACCCB') === 2.0, 'tennis: results answer weighs double');
  assert(t2('DAAAAB') === 1.0, 'tennis: one stray B does not lift a beginner (v1 gave 1.5)');
  assert(t2('CADDDD') === 3.0, 'tennis: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(t2('CDDDDD') === 3.0, 'tennis: racket bonus does not break the experience cap');
  assert(t2('BDAAAA') === 1.5, 'tennis: competitive racket background, all-A → 1.5');
  assert(t2('BCAAAA') === 1.0, 'tennis: regular racket background alone rounds away');
  assert(t2('BDBBBB') === 2.0, 'tennis: competitive racket background lifts all-B to 2.0');
  assert(t2('CCCCCC') === 2.5, 'tennis: +0.25 regular bonus does not round all-C up');
  assert(t2('DDCCCC') === 3.0, 'tennis: +0.5 competitive bonus lifts all-C to 3.0');
  assert(t2('AADDDD') === 1.5, 'tennis: a handful of sessions caps at 1.5');
  assert(t2('BADDDD') === 2.0, 'tennis: < 1 year caps at 2.0');
  assert(t2('ADCCCC') === 1.5, 'tennis: padel player who never played tennis capped at 1.5');
}

// ---------------------------------------------------------------------------
// tennis v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(TENNIS_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'tennis v1 all-A → 1.0');
  assert(TENNIS_QUESTIONNAIRE_V1.score(['C', 'C', 'C', 'C', 'C']) === 3.0, 'tennis v1 all-C → 3.0');
  assert(TENNIS_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'tennis v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// pickleball v2
// ---------------------------------------------------------------------------

{
  assert(p2('AAAAAA') === 1.0, 'pickleball: never played, misses everything → 1.0');
  assert(p2('DABBBB') === 1.5, 'pickleball: all-B skills → 1.5');
  assert(p2('DACCCC') === 2.5, 'pickleball: all-C skills → 2.5');
  assert(p2('DADDDD') === 3.5, 'pickleball: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(p2('DDDDDD') === 3.5, 'pickleball: racket bonus cannot exceed 3.5');
  // (2.67*3 + 2*3.5)/5 = 3.17 → 3.0: 3.5 needs top answers everywhere, incl. results.
  assert(p2('DADDDC') === 3.0, 'pickleball: one C keeps a strong player at 3.0');
  // (1.83*2 + 2.67 + 2*1.83)/5 = 2.0.
  assert(p2('DABBCB') === 2.0, 'pickleball: one stronger skill lifts half a step at most');
  // (2.67*3 + 2*1.83)/5 = 2.33 → 2.0: weak results pull strong self-described skills down.
  assert(p2('DACCCB') === 2.0, 'pickleball: results answer weighs double');
  assert(p2('DAAAAB') === 1.0, 'pickleball: one stray B does not lift a beginner (v1 gave 1.5)');
  assert(p2('CADDDD') === 3.0, 'pickleball: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(p2('CDDDDD') === 3.0, 'pickleball: racket bonus does not break the experience cap');
  assert(p2('BDAAAA') === 1.5, 'pickleball: competitive racket background, all-A → 1.5');
  assert(p2('BCAAAA') === 1.0, 'pickleball: regular racket background alone rounds away');
  assert(p2('BDBBBB') === 2.0, 'pickleball: competitive racket background lifts all-B to 2.0');
  assert(p2('CCCCCC') === 2.5, 'pickleball: +0.25 regular bonus does not round all-C up');
  assert(p2('DDCCCC') === 3.0, 'pickleball: +0.5 competitive bonus lifts all-C to 3.0');
  assert(p2('AADDDD') === 2.0, 'pickleball: a handful of sessions caps at 2.0 (not 1.5: racket transfer)');
  assert(p2('BADDDD') === 2.5, 'pickleball: < 6 months caps at 2.5');
  assert(p2('ADCCCC') === 2.0, 'pickleball: tennis convert on day one starts at 2.0');
}

// ---------------------------------------------------------------------------
// pickleball v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(PICKLEBALL_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'pickleball v1 all-A → 1.0');
  assert(PICKLEBALL_QUESTIONNAIRE_V1.score(['C', 'C', 'C', 'C', 'C']) === 3.0, 'pickleball v1 all-C → 3.0');
  assert(PICKLEBALL_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'pickleball v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// badminton v2
// ---------------------------------------------------------------------------

{
  assert(b2('AAAAAA') === 1.0, 'badminton: never played, misses everything → 1.0');
  assert(b2('DABBBB') === 1.5, 'badminton: all-B skills → 1.5');
  assert(b2('DACCCC') === 2.5, 'badminton: all-C skills → 2.5');
  assert(b2('DADDDD') === 3.5, 'badminton: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(b2('DDDDDD') === 3.5, 'badminton: racket bonus cannot exceed 3.5');
  // (2.67*3 + 2*3.5)/5 = 3.17 → 3.0: 3.5 needs top answers everywhere, incl. results.
  assert(b2('DADDDC') === 3.0, 'badminton: one C keeps a strong player at 3.0');
  // (1.83*2 + 2.67 + 2*1.83)/5 = 2.0.
  assert(b2('DABBCB') === 2.0, 'badminton: one stronger skill lifts half a step at most');
  // (2.67*3 + 2*1.83)/5 = 2.33 → 2.0: weak results pull strong self-described skills down.
  assert(b2('DACCCB') === 2.0, 'badminton: results answer weighs double');
  assert(b2('DAAAAB') === 1.0, 'badminton: one stray B does not lift a beginner (v1 gave 1.5)');
  assert(b2('CADDDD') === 3.0, 'badminton: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(b2('CDDDDD') === 3.0, 'badminton: racket bonus does not break the experience cap');
  assert(b2('BDAAAA') === 1.5, 'badminton: competitive racket background, all-A → 1.5');
  assert(b2('BCAAAA') === 1.0, 'badminton: regular racket background alone rounds away');
  assert(b2('BDBBBB') === 2.0, 'badminton: competitive racket background lifts all-B to 2.0');
  assert(b2('CCCCCC') === 2.5, 'badminton: +0.25 regular bonus does not round all-C up');
  assert(b2('DDCCCC') === 3.0, 'badminton: +0.5 competitive bonus lifts all-C to 3.0');
  assert(b2('AADDDD') === 1.5, 'badminton: a handful of sessions / garden play caps at 1.5');
  assert(b2('BADDDD') === 2.0, 'badminton: < 1 year caps at 2.0');
  assert(b2('ADCCCC') === 1.5, 'badminton: tennis/squash convert on day one capped at 1.5');
}

// ---------------------------------------------------------------------------
// badminton v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(BADMINTON_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'badminton v1 all-A → 1.0');
  assert(BADMINTON_QUESTIONNAIRE_V1.score(['C', 'C', 'C', 'C', 'C']) === 3.0, 'badminton v1 all-C → 3.0');
  assert(BADMINTON_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'badminton v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// table tennis v2 — 7 answers: experience, racket, rally, serve, receive, topspin, results(×2)
// ---------------------------------------------------------------------------

{
  assert(tt2('AAAAAAA') === 1.0, 'table tennis: never played, misses everything → 1.0');
  assert(tt2('DABBBBB') === 1.5, 'table tennis: all-B skills → 1.5');
  assert(tt2('DACCCCC') === 2.5, 'table tennis: all-C skills → 2.5');
  assert(tt2('DADDDDD') === 3.5, 'table tennis: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(tt2('DDDDDDD') === 3.5, 'table tennis: racket bonus cannot exceed 3.5');
  assert(tt2('DADDDDC') === 3.0, 'table tennis: one C keeps a strong player at 3.0');
  assert(tt2('DAAAAAB') === 1.0, 'table tennis: friendly games alone stay at 1.0');
  assert(tt2('DACCCCB') === 2.0, 'table tennis: weak results pull strong strokes down');
  assert(tt2('AABAAAA') === 1.0, 'table tennis: casual rallying without spin stays at 1.0');
  assert(tt2('AADDDDD') === 1.5, 'table tennis: casual ping-pong / a handful of sessions caps at 1.5');
  assert(tt2('BADDDDD') === 2.0, 'table tennis: < 1 year caps at 2.0');
  assert(tt2('CADDDDD') === 3.0, 'table tennis: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(tt2('ADCCCCC') === 1.5, 'table tennis: competitive racket player new to table tennis capped at 1.5');
  assert(tt2('BDAAAAA') === 1.0, 'table tennis: competitive racket background does not lift all-A (other sports: 1.5)');
  assert(tt2('DCBBBBC') === 2.0, 'table tennis: regular racket background earns nothing');
  assert(tt2('CCCCCCC') === 2.5, 'table tennis: regular racket background does not round all-C up');
  assert(tt2('DDCCCCC') === 2.5, 'table tennis: competitive +0.25 does not lift all-C a band');
}

// ---------------------------------------------------------------------------
// table tennis v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'table tennis v1 all-A → 1.0');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'B']) === 1.5, 'table tennis v1 one B → 1.5');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.score(['C', 'C', 'C', 'C', 'C']) === 3.0, 'table tennis v1 all-C → 3.0');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'table tennis v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// squash v2
// ---------------------------------------------------------------------------

{
  assert(sq2('AAAAAA') === 1.0, 'squash: never played, misses everything → 1.0');
  assert(sq2('DABBBB') === 1.5, 'squash: all-B skills → 1.5');
  assert(sq2('DACCCC') === 2.5, 'squash: all-C skills → 2.5');
  assert(sq2('DADDDD') === 3.5, 'squash: all-D skills + 2+ years → 3.5 (ceiling)');
  assert(sq2('DDDDDD') === 3.5, 'squash: racket bonus cannot exceed 3.5');
  // (2.67*3 + 2*3.5)/5 = 3.17 → 3.0: 3.5 needs top answers everywhere, incl. results.
  assert(sq2('DADDDC') === 3.0, 'squash: one C keeps a strong player at 3.0');
  // (1.83*2 + 2.67 + 2*1.83)/5 = 2.0.
  assert(sq2('DABBCB') === 2.0, 'squash: one stronger skill lifts half a step at most');
  // (2.67*3 + 2*1.83)/5 = 2.33 → 2.0: weak results pull strong self-described skills down.
  assert(sq2('DACCCB') === 2.0, 'squash: results answer weighs double');
  assert(sq2('DAAAAB') === 1.0, 'squash: one stray B does not lift a beginner (v1 gave 1.5)');
  assert(sq2('CADDDD') === 3.0, 'squash: under 2 years caps at 3.0 — 3.5 is 2+ years only');
  assert(sq2('CDDDDD') === 3.0, 'squash: racket bonus does not break the experience cap');
  assert(sq2('BDAAAA') === 1.5, 'squash: competitive racket background, all-A → 1.5');
  assert(sq2('BCAAAA') === 1.0, 'squash: regular racket background alone rounds away');
  assert(sq2('BDBBBB') === 2.0, 'squash: competitive racket background lifts all-B to 2.0');
  assert(sq2('CCCCCC') === 2.5, 'squash: +0.25 regular bonus does not round all-C up');
  assert(sq2('DDCCCC') === 3.0, 'squash: +0.5 competitive bonus lifts all-C to 3.0');
  assert(sq2('AADDDD') === 1.5, 'squash: a handful of sessions caps at 1.5');
  assert(sq2('BADDDD') === 2.0, 'squash: < 1 year caps at 2.0');
  assert(sq2('ADCCCC') === 1.5, 'squash: competitive tennis player new to squash capped at 1.5');
}

// ---------------------------------------------------------------------------
// squash v1 unchanged
// ---------------------------------------------------------------------------

{
  assert(SQUASH_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'A']) === 1.0, 'squash v1 all-A → 1.0');
  assert(SQUASH_QUESTIONNAIRE_V1.score(['A', 'A', 'A', 'A', 'B']) === 1.5, 'squash v1 one B → 1.5');
  assert(SQUASH_QUESTIONNAIRE_V1.score(['C', 'C', 'C', 'C', 'C']) === 3.0, 'squash v1 all-C → 3.0');
  assert(SQUASH_QUESTIONNAIRE_V1.score(['D', 'D', 'D', 'D', 'D']) === 3.5, 'squash v1 all-D → 3.5');
}

// ---------------------------------------------------------------------------
// version resolution
// ---------------------------------------------------------------------------

{
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, undefined) === PADEL_QUESTIONNAIRE_V1, 'unversioned padel → v1');
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, '') === PADEL_QUESTIONNAIRE_V1, 'empty version → v1');
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, 'padel-v1') === PADEL_QUESTIONNAIRE_V1, 'explicit v1');
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, 'padel-v2') === PADEL_QUESTIONNAIRE_V2, 'explicit v2');
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, 'padel-v9') === undefined, 'unknown version rejected');
  assert(resolveSubmittedQuestionnaire(Sport.PADEL, 'tennis-v1') === undefined, 'other sport version rejected');
  assert(resolveSubmittedQuestionnaire(Sport.TENNIS, undefined) === TENNIS_QUESTIONNAIRE_V1, 'unversioned tennis → v1');
  assert(resolveSubmittedQuestionnaire(Sport.TENNIS, 'tennis-v1') === TENNIS_QUESTIONNAIRE_V1, 'explicit tennis v1');
  assert(resolveSubmittedQuestionnaire(Sport.TENNIS, 'tennis-v2') === TENNIS_QUESTIONNAIRE_V2, 'explicit tennis v2');
  assert(resolveSubmittedQuestionnaire(Sport.TENNIS, 'padel-v2') === undefined, 'padel version rejected for tennis');
  assert(TENNIS_QUESTIONNAIRE_V2.minQuestions === 6, 'tennis v2 has 6 questions');
  assert(resolveSubmittedQuestionnaire(Sport.PICKLEBALL, undefined) === PICKLEBALL_QUESTIONNAIRE_V1, 'unversioned pickleball → v1');
  assert(resolveSubmittedQuestionnaire(Sport.PICKLEBALL, 'pickleball-v1') === PICKLEBALL_QUESTIONNAIRE_V1, 'explicit pickleball v1');
  assert(resolveSubmittedQuestionnaire(Sport.PICKLEBALL, 'pickleball-v2') === PICKLEBALL_QUESTIONNAIRE_V2, 'explicit pickleball v2');
  assert(resolveSubmittedQuestionnaire(Sport.PICKLEBALL, 'tennis-v2') === undefined, 'tennis version rejected for pickleball');
  assert(PICKLEBALL_QUESTIONNAIRE_V2.minQuestions === 6, 'pickleball v2 has 6 questions');
  assert(resolveSubmittedQuestionnaire(Sport.BADMINTON, undefined) === BADMINTON_QUESTIONNAIRE_V1, 'unversioned badminton → v1');
  assert(resolveSubmittedQuestionnaire(Sport.BADMINTON, 'badminton-v1') === BADMINTON_QUESTIONNAIRE_V1, 'explicit badminton v1');
  assert(resolveSubmittedQuestionnaire(Sport.BADMINTON, 'badminton-v2') === BADMINTON_QUESTIONNAIRE_V2, 'explicit badminton v2');
  assert(resolveSubmittedQuestionnaire(Sport.BADMINTON, 'pickleball-v2') === undefined, 'pickleball version rejected for badminton');
  assert(BADMINTON_QUESTIONNAIRE_V2.minQuestions === 6, 'badminton v2 has 6 questions');
  assert(resolveSubmittedQuestionnaire(Sport.TABLE_TENNIS, undefined) === TABLE_TENNIS_QUESTIONNAIRE_V1, 'unversioned table tennis → v1');
  assert(resolveSubmittedQuestionnaire(Sport.TABLE_TENNIS, 'table-tennis-v1') === TABLE_TENNIS_QUESTIONNAIRE_V1, 'explicit table tennis v1');
  assert(resolveSubmittedQuestionnaire(Sport.TABLE_TENNIS, 'table-tennis-v2') === TABLE_TENNIS_QUESTIONNAIRE_V2, 'explicit table tennis v2');
  assert(resolveSubmittedQuestionnaire(Sport.TABLE_TENNIS, 'tennis-v2') === undefined, 'tennis version rejected for table tennis');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V2.minQuestions === 7, 'table tennis v2 has 7 questions');
  assert(resolveSubmittedQuestionnaire(Sport.SQUASH, undefined) === SQUASH_QUESTIONNAIRE_V1, 'unversioned squash → v1');
  assert(resolveSubmittedQuestionnaire(Sport.SQUASH, 'squash-v1') === SQUASH_QUESTIONNAIRE_V1, 'explicit squash v1');
  assert(resolveSubmittedQuestionnaire(Sport.SQUASH, 'squash-v2') === SQUASH_QUESTIONNAIRE_V2, 'explicit squash v2');
  assert(resolveSubmittedQuestionnaire(Sport.SQUASH, 'badminton-v2') === undefined, 'badminton version rejected for squash');
  assert(SQUASH_QUESTIONNAIRE_V2.minQuestions === 6, 'squash v2 has 6 questions');
}

console.log('questionnaireScoring.test: ok');
