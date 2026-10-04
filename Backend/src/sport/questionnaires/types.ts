export type SportQuestionnaireConfig = {
  id: string;
  questionKeys: readonly string[];
  answerOptions: 'ABCD';
  minQuestions: number;
  /** Validated A–D answers (one per question key) → starting level. */
  score: (answers: string[]) => number;
};
