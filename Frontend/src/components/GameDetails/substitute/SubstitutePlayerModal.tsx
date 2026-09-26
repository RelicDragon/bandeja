import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { gamesApi } from '@/api';
import type { BasicUser, Game, GameParticipant } from '@/types';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { SubstituteCandidateList } from './SubstituteCandidateList';
import { SubstituteConfirmStep } from './SubstituteConfirmStep';
import { SubstituteOutList } from './SubstituteOutList';

interface SubstitutePlayerModalProps {
  open: boolean;
  game: Game;
  /** Seats that can be vacated; the roster card already dropped the trainer. */
  players: readonly GameParticipant[];
  onClose: () => void;
  onSubstituted: () => void;
}

/** Three steps: who leaves the court, who takes the seat, then an explicit confirm. */
export const SubstitutePlayerModal = ({
  open,
  game,
  players,
  onClose,
  onSubstituted,
}: SubstitutePlayerModalProps) => {
  const { t } = useTranslation();
  const [outUser, setOutUser] = useState<BasicUser | null>(null);
  const [inUser, setInUser] = useState<BasicUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset on open rather than on close so the exit animation keeps showing the last step.
  useEffect(() => {
    if (!open) return;
    setOutUser(null);
    setInUser(null);
  }, [open]);

  const excludeUserIds = useMemo(
    () => game.participants.filter(isParticipantPlaying).map((p) => p.userId),
    [game.participants],
  );

  const handleConfirm = async () => {
    if (!outUser || !inUser || submitting) return;
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

  const outName = outUser
    ? [outUser.firstName, outUser.lastName].filter(Boolean).join(' ').trim()
    : '';
  const step = !outUser ? 'out' : !inUser ? 'in' : 'confirm';

  return (
    <Dialog open={open} onClose={onClose} modalId="substitute-player">
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-primary-600 dark:text-primary-400" />
            {t('gameDetails.substitutePlayerTitle')}
          </DialogTitle>
        </DialogHeader>

        <div key={step} className="space-y-4 p-4 motion-safe:animate-fade-in">
          {step === 'out' ? (
            <SubstituteOutList players={players} onSelect={setOutUser} />
          ) : step === 'in' ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <span className="font-medium">{t('gameDetails.substitutePlayerReplacing')}:</span>
                <span className="min-w-0 flex-1 truncate">{outName || '—'}</span>
                <button
                  type="button"
                  onClick={() => setOutUser(null)}
                  className="shrink-0 font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  {t('common.change')}
                </button>
              </div>
              <SubstituteCandidateList
                gameId={game.id}
                gameSport={game.sport}
                excludeUserIds={excludeUserIds}
                onSelect={setInUser}
              />
            </>
          ) : outUser && inUser ? (
            <SubstituteConfirmStep
              outUser={outUser}
              inUser={inUser}
              submitting={submitting}
              onBack={() => setInUser(null)}
              onConfirm={() => void handleConfirm()}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
