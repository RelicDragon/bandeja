import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components';
import { GameSetupForm, type GameSetupFormRef } from '@/components/GameSetup/GameSetupForm';
import type { GameSetupParams } from '@/types';
import { PLAYOFF_GAME_TYPE_TEMPLATES } from './playoffTemplates';

type PlayoffGameType = 'WINNER_COURT' | 'AMERICANO';

interface PlayoffGameSetupStepProps {
  gameType: PlayoffGameType;
  onBack: () => void;
  onConfirm: (params: GameSetupParams) => void;
  submitting: boolean;
}

export const PlayoffGameSetupStep = ({ gameType, onBack, onConfirm, submitting }: PlayoffGameSetupStepProps) => {
  const { t } = useTranslation();
  const formRef = useRef<GameSetupFormRef>(null);

  const initialValues = PLAYOFF_GAME_TYPE_TEMPLATES[gameType];

  const handleConfirm = () => {
    formRef.current?.submit();
  };

  return (
    <div className="space-y-4">
      <div className="flex-1 overflow-y-auto">
        <GameSetupForm
          key={gameType}
          ref={formRef}
          initialValues={initialValues}
          isEditing={!submitting}
          onConfirm={onConfirm}
        />
      </div>
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
