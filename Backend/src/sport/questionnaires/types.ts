import type { scoreToLevel } from './scoring';

export type SportQuestionnaireConfig = {
  id: string;
  questionKeys: readonly string[];
  answerOptions: 'ABCD';
  scoreToLevel: typeof scoreToLevel;
  minQuestions: number;
};
