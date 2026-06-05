import type { User } from '@/types';
import type { Sport } from '@/types';
import type { QuestionnaireStatus } from '@/api/sportQuestionnaire';
import { shouldSuggestSportQuestionnaire } from '@/utils/sportQuestionnaire';

const CITY_PROMPT_DISMISSED_KEY = 'cityPromptDismissed';

export function isCityPromptBannerVisible(user: User | null | undefined): boolean {
  if (!user || user.cityIsSet === true) return false;
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(CITY_PROMPT_DISMISSED_KEY) !== 'true';
}

export function isSportQuestionnairePromptVisible(
  user: User | null | undefined,
  sport: Sport,
  status?: QuestionnaireStatus | null,
): boolean {
  if (!user || user.cityIsSet !== true) return false;
  return shouldSuggestSportQuestionnaire(user, sport, status);
}

export function isHomeHeroAdBlocked(
  user: User | null | undefined,
  sport: Sport,
  questionnaireStatus?: QuestionnaireStatus | null,
): boolean {
  return isCityPromptBannerVisible(user) || isSportQuestionnairePromptVisible(user, sport, questionnaireStatus);
}
