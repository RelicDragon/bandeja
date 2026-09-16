import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { gamesApi } from '@/api';
import type { BasicUser, Game } from '@/types';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { SubstituteCandidateList } from './SubstituteCandidateList';
import { SubstituteConfirmStep } from './SubstituteConfirmStep';

interface SubstitutePlayerModalProps {
  game: Game;
  outUser: BasicUser;
  onClose: () => void;
  onSubstituted: () => void;
}

/** Two steps only — the outgoing player is already chosen on the roster card. */
export const SubstitutePlayerModal = ({
  game,
  outUser,
  onClose,
  onSubstituted,
}: SubstitutePlayerModalProps) => {
  const { t } = useTranslation();
  const [inUser, setInUser] = useState<BasicUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setInUser(null);
  }, [outUser.id]);

  const excludeUserIds = useMemo(
    () => game.participants.filter(isParticipantPlaying).map((p) => p.userId),
    [game.participants],
  );

  const handleConfirm = async () => {
    if (!inUser || submitting) return;
    setSubmitting(true);
    try {
      await gamesApi.substituteParticipant(game.id, outUser.id, inUser.id);
      toast.success(t('gameDetails.substitutePlayerSuccess'));
      onSubstituted();
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const outName = [outUser.firstName, outUser.lastName].filter(Boolean).join(' ').trim();

  return (
    <Dialog open onClose={onClose} modalId="substitute-player">
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-primary-600 dark:text-primary-400" />
            {t('gameDetails.substitutePlayerTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {inUser ? (
            <SubstituteConfirmStep
              outUser={outUser}
              inUser={inUser}
              submitting={submitting}
              onBack={() => setInUser(null)}
              onConfirm={() => void handleConfirm()}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <span className="font-medium">{t('gameDetails.substitutePlayerReplacing')}:</span>
                <span>{outName || '—'}</span>
              </div>
              <SubstituteCandidateList
                gameId={game.id}
                gameSport={game.sport}
                excludeUserIds={excludeUserIds}
                onSelect={setInUser}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
