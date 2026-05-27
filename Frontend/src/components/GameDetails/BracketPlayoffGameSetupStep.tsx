import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, GameFormatCard } from '@/components';
import { useGameFormat } from '@/hooks/useGameFormat';
import type { Game, GameSetupParams } from '@/types';
import { playoffFormatInitialFromSeason } from './playoffTemplates';
import { PlayoffGameFormatWizard } from './PlayoffGameFormatWizard';

interface BracketPlayoffGameSetupStepProps {
  seasonGame?: Partial<Game> | null;
  onBack: () => void;
  onConfirm: (params: GameSetupParams) => void;
  submitting: boolean;
}

export const BracketPlayoffGameSetupStep = ({
  seasonGame,
  onBack,
  onConfirm,
  submitting,
}: BracketPlayoffGameSetupStepProps) => {
  const { t } = useTranslation();
  const formatInitial = useMemo(
    () =>
      seasonGame
        ? playoffFormatInitialFromSeason(seasonGame)
        : playoffFormatInitialFromSeason(null, {
            gameType: 'CLASSIC',
            matchGenerationType: 'HANDMADE',
            scoringMode: 'CLASSIC',
          }),
    [seasonGame]
  );
  const gameFormat = useGameFormat(formatInitial, {
    skipGenerationParticipantDefaults: true,
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [formatReviewed, setFormatReviewed] = useState(false);

  const handleOpenWizard = () => {
    setFormatReviewed(true);
    setWizardOpen(true);
  };

  const handleConfirm = () => {
    onConfirm({
      ...gameFormat.setupPayload,
      scoringMode: gameFormat.scoringMode,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        {t('gameDetails.bracketGameSetupHint', {
          defaultValue: 'Classic match scoring (same as regular season fixtures).',
        })}
      </p>
      {!formatReviewed && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400 rounded-lg border border-amber-200/70 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2">
          {t('gameDetails.bracketGameSetupBlindAdvanceWarn', {
            defaultValue: 'Review match format before continuing — defaults apply to every bracket game.',
          })}
        </p>
      )}
      <GameFormatCard
        entityType="LEAGUE_SEASON"
        format={gameFormat}
        sport={seasonGame?.sport}
        onOpenWizard={handleOpenWizard}
      />
      <PlayoffGameFormatWizard
        isOpen={wizardOpen}
        format={gameFormat}
        sport={seasonGame?.sport}
        onClose={() => setWizardOpen(false)}
      />
      <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={submitting}>
          {t('common.back', { defaultValue: 'Back' })}
        </Button>
        <Button onClick={handleConfirm} disabled={submitting} className="flex-1">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('common.loading')}
            </>
          ) : (
            t('common.next', { defaultValue: 'Next' })
          )}
        </Button>
      </div>
    </div>
  );
};
