import { Sport } from '@prisma/client';
import { getSportConfig } from '../sportRegistry';
import type { SportQuestionnaireConfig } from './types';

export type { SportQuestionnaireConfig } from './types';
export {
  scoreToLevel,
  scoreToLevelFourQuestions,
  scoreBySum,
  scoreAnchoredQuestionnaire,
  sumAnswerScores,
  validateAnswers,
  VALID_ANSWERS,
} from './scoring';
export {
  PADEL_QUESTIONNAIRE_V1,
  PADEL_QUESTIONNAIRE_V1_ID,
  PADEL_QUESTIONNAIRE_V2,
  PADEL_QUESTIONNAIRE_V2_ID,
  scorePadelV2,
} from './padel';
export {
  TENNIS_QUESTIONNAIRE_V1,
  TENNIS_QUESTIONNAIRE_V1_ID,
  TENNIS_QUESTIONNAIRE_V2,
  TENNIS_QUESTIONNAIRE_V2_ID,
  TENNIS_QUESTIONNAIRE_ID,
  scoreTennisV2,
} from './tennis';
export {
  PICKLEBALL_QUESTIONNAIRE_V1,
  PICKLEBALL_QUESTIONNAIRE_V1_ID,
  PICKLEBALL_QUESTIONNAIRE_V2,
  PICKLEBALL_QUESTIONNAIRE_V2_ID,
  PICKLEBALL_QUESTIONNAIRE_ID,
  scorePickleballV2,
} from './pickleball';
export {
  BADMINTON_QUESTIONNAIRE_V1,
  BADMINTON_QUESTIONNAIRE_V1_ID,
  BADMINTON_QUESTIONNAIRE_V2,
  BADMINTON_QUESTIONNAIRE_V2_ID,
  BADMINTON_QUESTIONNAIRE_ID,
  scoreBadmintonV2,
} from './badminton';
export {
  TABLE_TENNIS_QUESTIONNAIRE_V1,
  TABLE_TENNIS_QUESTIONNAIRE_V1_ID,
  TABLE_TENNIS_QUESTIONNAIRE_V2,
  TABLE_TENNIS_QUESTIONNAIRE_V2_ID,
  TABLE_TENNIS_QUESTIONNAIRE_ID,
  scoreTableTennisV2,
} from './tableTennis';
export {
  SQUASH_QUESTIONNAIRE_V1,
  SQUASH_QUESTIONNAIRE_V1_ID,
  SQUASH_QUESTIONNAIRE_V2,
  SQUASH_QUESTIONNAIRE_V2_ID,
  SQUASH_QUESTIONNAIRE_ID,
  scoreSquashV2,
} from './squash';
export { isQuestionnaireSuggestedForProfile } from './suggested';

export function getQuestionnaireForSport(sport: Sport): SportQuestionnaireConfig | undefined {
  return getSportConfig(sport).questionnaire;
}

/**
 * Which questionnaire a submission was answered against. Clients that send no
 * `questionnaireVersion` predate versioning and showed the first-shipped set
 * (store builds have no OTA), so they are scored with the oldest config.
 * Returns undefined for a sport without a questionnaire or an unknown version.
 */
export function resolveSubmittedQuestionnaire(
  sport: Sport,
  version: unknown,
): SportQuestionnaireConfig | undefined {
  const config = getSportConfig(sport);
  const current = config.questionnaire;
  if (!current) return undefined;
  const legacy = config.legacyQuestionnaires ?? [];
  if (version == null || version === '') return legacy[0] ?? current;
  return [current, ...legacy].find((q) => q.id === version);
}
