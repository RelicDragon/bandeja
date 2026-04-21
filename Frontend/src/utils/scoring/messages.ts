import type { TFunction } from 'i18next';
import type { ValidationReason } from './validateSet';

export const validationMessage = (
  t: TFunction,
  reason: ValidationReason,
  detail?: Record<string, number | string>
): string => {
  switch (reason) {
    case 'NEGATIVE_SCORE':
      return t('gameResults.scoringErrors.negativeScore') || 'Scores cannot be negative';
    case 'EXCEEDS_TOTAL':
      return t('gameResults.scoringErrors.exceedsTotal', { total: detail?.total ?? '' }) || `Total cannot exceed ${detail?.total}`;
    case 'EXCEEDS_TEAM_MAX':
      return t('gameResults.scoringErrors.exceedsTeamMax', { max: detail?.max ?? '' }) || `Score cannot exceed ${detail?.max}`;
    case 'TOTAL_MISMATCH':
      return t('gameResults.scoringErrors.totalMismatch', { total: detail?.total ?? '' }) || `Scores must sum to ${detail?.total}`;
    case 'DRAW_NOT_ALLOWED':
      return t('gameResults.scoringErrors.drawNotAllowed') || 'Draws are not allowed in this format';
    case 'CLASSIC_NEEDS_WIN_BY_2':
      return t('gameResults.scoringErrors.classicNeedsWinBy2') || 'Set must be won by 2 games';
    case 'CLASSIC_SCORE_TOO_HIGH':
      return t('gameResults.scoringErrors.classicScoreTooHigh', { target: detail?.target ?? '' }) || `Max games per set is ${detail?.target}`;
    case 'CLASSIC_SCORE_TOO_LOW_TO_WIN':
      return t('gameResults.scoringErrors.classicScoreTooLowToWin', { target: detail?.target ?? '' }) || `A team must reach ${detail?.target} games to win the set`;
    case 'CLASSIC_INCOMPLETE':
      return t('gameResults.scoringErrors.classicIncomplete') || 'Set looks incomplete — did you mean tiebreak?';
    case 'TIEBREAK_DRAW':
      return t('gameResults.scoringErrors.tiebreakDraw') || 'Tiebreak cannot end in a draw';
    case 'TIEBREAK_WIN_BY_2':
      return t('gameResults.scoringErrors.tiebreakWinBy2') || 'Tiebreak must be won by 2 points';
    case 'TIEBREAK_TOO_LOW':
      return t('gameResults.scoringErrors.tiebreakTooLow', { target: detail?.target ?? '' }) || `Tiebreak goes to at least ${detail?.target} points`;
    case 'SUPER_TIEBREAK_DRAW':
      return t('gameResults.scoringErrors.superTiebreakDraw') || 'Super tiebreak cannot end in a draw';
    case 'SUPER_TIEBREAK_WIN_BY_2':
      return t('gameResults.scoringErrors.superTiebreakWinBy2') || 'Super tiebreak must be won by 2 points';
    case 'SUPER_TIEBREAK_TOO_LOW':
      return t('gameResults.scoringErrors.superTiebreakTooLow', { target: detail?.target ?? '' }) || `Super tiebreak goes to at least ${detail?.target} points`;
    case 'SET_AFTER_MATCH_DECIDED':
      return t('gameResults.scoringErrors.setAfterMatchDecided') || 'Match already decided';
    default:
      return t('errors.generic') || 'Invalid score';
  }
};
