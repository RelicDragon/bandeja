import { scoreToLevel } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const TABLE_TENNIS_QUESTIONNAIRE_ID = 'table-tennis-v1';

export const TABLE_TENNIS_QUESTION_KEYS = [
  'sportQuestionnaire.tableTennis.q1',
  'sportQuestionnaire.tableTennis.q2',
  'sportQuestionnaire.tableTennis.q3',
  'sportQuestionnaire.tableTennis.q4',
  'sportQuestionnaire.tableTennis.q5',
] as const;

export const TABLE_TENNIS_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: TABLE_TENNIS_QUESTIONNAIRE_ID,
  questionKeys: TABLE_TENNIS_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: TABLE_TENNIS_QUESTION_KEYS.length,
  scoreToLevel,
};
