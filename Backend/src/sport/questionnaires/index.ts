import { Sport } from '@prisma/client';
import { getSportConfig } from '../sportRegistry';
import type { SportQuestionnaireConfig } from './types';

export type { SportQuestionnaireConfig } from './types';
export {
  scoreToLevel,
  scoreToLevelFourQuestions,
  sumAnswerScores,
  validateAnswers,
  VALID_ANSWERS,
} from './scoring';
export {
  PADEL_QUESTIONNAIRE_V1,
  PADEL_QUESTIONNAIRE_ID,
  scoreQuestionnaireAnswers,
  validatePadelQuestionnaireAnswers,
} from './padel';
export { TENNIS_QUESTIONNAIRE_V1, TENNIS_QUESTIONNAIRE_ID } from './tennis';
export {
  PICKLEBALL_QUESTIONNAIRE_V1,
  PICKLEBALL_QUESTIONNAIRE_ID,
} from './pickleball';
export { BADMINTON_QUESTIONNAIRE_V1, BADMINTON_QUESTIONNAIRE_ID } from './badminton';
export {
  TABLE_TENNIS_QUESTIONNAIRE_V1,
  TABLE_TENNIS_QUESTIONNAIRE_ID,
} from './tableTennis';
export { SQUASH_QUESTIONNAIRE_V1, SQUASH_QUESTIONNAIRE_ID } from './squash';
export { isQuestionnaireSuggestedForProfile } from './suggested';

export function getQuestionnaireForSport(sport: Sport): SportQuestionnaireConfig | undefined {
  return getSportConfig(sport).questionnaire;
}
