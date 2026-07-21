import type { Faq } from '@/api/faq';
import type { TFunction } from 'i18next';

export const FIXED_TEAM_STANDINGS_FAQ_ID = '__auto_fixed_team_standings__';

export function buildFixedTeamStandingsFaq(gameId: string, t: TFunction): Faq {
  return {
    id: FIXED_TEAM_STANDINGS_FAQ_ID,
    gameId,
    question: t('faq.fixedTeamStandings.question'),
    answer: t('faq.fixedTeamStandings.answer'),
    order: Number.MAX_SAFE_INTEGER,
    createdAt: '',
    updatedAt: '',
  };
}

export function withFixedTeamStandingsFaq(
  faqs: Faq[],
  gameId: string,
  include: boolean,
  t: TFunction
): Faq[] {
  if (!include) return faqs;
  return [...faqs, buildFixedTeamStandingsFaq(gameId, t)];
}
