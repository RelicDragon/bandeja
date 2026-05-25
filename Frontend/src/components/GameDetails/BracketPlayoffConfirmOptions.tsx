import { useTranslation } from 'react-i18next';
import { formatPlayInPairsForSummary } from '@/utils/playoffWizardBracketPlan.util';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';

interface BracketPlayoffConfirmOptionsProps {
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeEnabled?: boolean;
  customByeSeedRanks?: number[];
  customPlayInEnabled?: boolean;
  playInSeedPairs?: PlayInSeedPair[];
  className?: string;
}

export function BracketPlayoffConfirmOptions({
  includeThirdPlace,
  includeConsolationBracket,
  includeDoubleElimination,
  customByeEnabled,
  customByeSeedRanks = [],
  customPlayInEnabled,
  playInSeedPairs = [],
  className = 'text-xs text-gray-600 dark:text-gray-400 mt-1 space-y-0.5',
}: BracketPlayoffConfirmOptionsProps) {
  const { t } = useTranslation();
  const showByes = customByeEnabled && customByeSeedRanks.length > 0;
  const showPlayIn = customPlayInEnabled && playInSeedPairs.length > 0;
  const showPhase4 = includeThirdPlace || includeConsolationBracket || includeDoubleElimination;

  if (!showPhase4 && !showByes && !showPlayIn) return null;

  return (
    <ul className={`list-disc list-inside ml-1 ${className}`}>
      {includeThirdPlace && (
        <li>{t('gameDetails.bracketThirdPlaceMatch', { defaultValue: 'Third-place match' })}</li>
      )}
      {includeConsolationBracket && (
        <li>
          {t('gameDetails.bracketConsolationBracket', {
            defaultValue: 'Consolation bracket (first-round losers)',
          })}
        </li>
      )}
      {includeDoubleElimination && (
        <li>{t('gameDetails.bracketDoubleElimination', { defaultValue: 'Double elimination' })}</li>
      )}
      {showByes && (
        <li>
          {t('gameDetails.bracketCustomByesLabel', { defaultValue: 'Custom byes' })}:{' '}
          {customByeSeedRanks.join(', ')}
        </li>
      )}
      {showPlayIn && (
        <li>
          {t('gameDetails.bracketCustomPlayInLabel', { defaultValue: 'Custom play-in pairings' })}:{' '}
          {formatPlayInPairsForSummary(playInSeedPairs)}
        </li>
      )}
    </ul>
  );
}
