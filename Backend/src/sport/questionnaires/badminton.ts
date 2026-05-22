import { scoreToLevel } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const BADMINTON_QUESTIONNAIRE_ID = 'badminton-v1';

export const BADMINTON_QUESTION_KEYS = [
  'sportQuestionnaire.badminton.q1',
  'sportQuestionnaire.badminton.q2',
  'sportQuestionnaire.badminton.q3',
  'sportQuestionnaire.badminton.q4',
  'sportQuestionnaire.badminton.q5',
] as const;

export const BADMINTON_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: BADMINTON_QUESTIONNAIRE_ID,
  questionKeys: BADMINTON_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: BADMINTON_QUESTION_KEYS.length,
  scoreToLevel,
};
