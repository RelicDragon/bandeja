import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, GameFormatCard, GameFormatWizard } from '@/components';
import { useGameFormat } from '@/hooks/useGameFormat';
import type { GameSetupParams } from '@/types';
import { PLAYOFF_GAME_TYPE_SEEDS } from './playoffTemplates';

type PlayoffGameType = 'WINNER_COURT' | 'AMERICANO';

interface PlayoffGameSetupStepProps {
  gameType: PlayoffGameType;
  onBack: () => void;
  onConfirm: (params: GameSetupParams) => void;
  submitting: boolean;
}

export const PlayoffGameSetupStep = ({ gameType, onBack, onConfirm, submitting }: PlayoffGameSetupStepProps) => {
  const { t } = useTranslation();
  const gameFormat = useGameFormat(PLAYOFF_GAME_TYPE_SEEDS[gameType], {
    skipGenerationParticipantDefaults: true,
  });
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleConfirm = () => {
    onConfirm({
      ...gameFormat.setupPayload,
      scoringMode: gameFormat.scoringMode,
    });
  };

  return (
    <div className="space-y-4">
      <GameFormatCard
        entityType="LEAGUE_SEASON"
        format={gameFormat}
        onOpenWizard={() => setWizardOpen(true)}
      />
      {wizardOpen && (
        <GameFormatWizard
          isOpen={wizardOpen}
          format={gameFormat}
          hideGenerationStep
          onClose={() => setWizardOpen(false)}
        />
      )}
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
            t('gameDetails.createPlayoff', { defaultValue: 'Create playoff' })
          )}
        </Button>
      </div>
    </div>
  );
};
