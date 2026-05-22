import { scoreToLevelFourQuestions } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const SQUASH_QUESTIONNAIRE_ID = 'squash-v1';

export const SQUASH_QUESTION_KEYS = [
  'sportQuestionnaire.squash.q1',
  'sportQuestionnaire.squash.q2',
  'sportQuestionnaire.squash.q3',
  'sportQuestionnaire.squash.q4',
] as const;

export const SQUASH_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: SQUASH_QUESTIONNAIRE_ID,
  questionKeys: SQUASH_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: SQUASH_QUESTION_KEYS.length,
  scoreToLevel: scoreToLevelFourQuestions,
};
