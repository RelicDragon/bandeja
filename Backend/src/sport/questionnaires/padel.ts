import { scoreToLevel, sumAnswerScores, validateAnswers } from './scoring';
import type { SportQuestionnaireConfig } from './types';

export const PADEL_QUESTIONNAIRE_ID = 'padel-v1';

export const PADEL_QUESTION_KEYS = [
  'welcome.q1',
  'welcome.q2',
  'welcome.q3',
  'welcome.q4',
  'welcome.q5',
] as const;

export const PADEL_QUESTIONNAIRE_V1: SportQuestionnaireConfig = {
  id: PADEL_QUESTIONNAIRE_ID,
  questionKeys: PADEL_QUESTION_KEYS,
  answerOptions: 'ABCD',
  minQuestions: PADEL_QUESTION_KEYS.length,
  scoreToLevel,
};

export const scoreQuestionnaireAnswers = sumAnswerScores;

export function validatePadelQuestionnaireAnswers(answers: unknown): string[] {
  return validateAnswers(answers, PADEL_QUESTION_KEYS.length);
}
