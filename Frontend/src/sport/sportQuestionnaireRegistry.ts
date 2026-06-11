import type { Sport } from '@/types';

export type SportQuestionnaireConfig = {
  id: string;
  questionKeys: readonly string[];
};

const PADEL_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const TENNIS_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const PICKLEBALL_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const BADMINTON_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const TABLE_TENNIS_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const SQUASH_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

export const SPORT_QUESTIONNAIRE_REGISTRY: Partial<Record<Sport, SportQuestionnaireConfig>> = {
  PADEL: { id: 'padel-v1', questionKeys: PADEL_QUESTIONS },
  TENNIS: { id: 'tennis-v1', questionKeys: TENNIS_QUESTIONS },
  PICKLEBALL: { id: 'pickleball-v1', questionKeys: PICKLEBALL_QUESTIONS },
  BADMINTON: { id: 'badminton-v1', questionKeys: BADMINTON_QUESTIONS },
  TABLE_TENNIS: { id: 'table-tennis-v1', questionKeys: TABLE_TENNIS_QUESTIONS },
  SQUASH: { id: 'squash-v1', questionKeys: SQUASH_QUESTIONS },
};

export const SPORT_QUESTIONNAIRE_I18N_KEY: Record<Sport, string> = {
  PADEL: 'padel',
  TENNIS: 'tennis',
  PICKLEBALL: 'pickleball',
  BADMINTON: 'badminton',
  TABLE_TENNIS: 'tableTennis',
  SQUASH: 'squash',
};

export function getSportQuestionnaireConfig(sport: Sport): SportQuestionnaireConfig | undefined {
  return SPORT_QUESTIONNAIRE_REGISTRY[sport];
}

export function sportHasQuestionnaire(sport: Sport): boolean {
  return getSportQuestionnaireConfig(sport) != null;
}
