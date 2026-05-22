import { scoreToLevel } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const TENNIS_QUESTIONNAIRE_ID = 'tennis-v1';

export const TENNIS_QUESTION_KEYS = [
  'sportQuestionnaire.tennis.q1',
  'sportQuestionnaire.tennis.q2',
  'sportQuestionnaire.tennis.q3',
  'sportQuestionnaire.tennis.q4',
  'sportQuestionnaire.tennis.q5',
] as const;

export const TENNIS_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: TENNIS_QUESTIONNAIRE_ID,
  questionKeys: TENNIS_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: TENNIS_QUESTION_KEYS.length,
  scoreToLevel,
};
