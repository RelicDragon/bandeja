import { scoreToLevel } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const PICKLEBALL_QUESTIONNAIRE_ID = 'pickleball-v1';

export const PICKLEBALL_QUESTION_KEYS = [
  'sportQuestionnaire.pickleball.q1',
  'sportQuestionnaire.pickleball.q2',
  'sportQuestionnaire.pickleball.q3',
  'sportQuestionnaire.pickleball.q4',
  'sportQuestionnaire.pickleball.q5',
] as const;

export const PICKLEBALL_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: PICKLEBALL_QUESTIONNAIRE_ID,
  questionKeys: PICKLEBALL_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: PICKLEBALL_QUESTION_KEYS.length,
  scoreToLevel,
};
