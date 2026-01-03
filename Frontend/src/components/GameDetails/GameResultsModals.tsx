import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SetResultModal } from '@/components/SetResultModal';
import { CourtModal } from '@/components/CourtModal';
import { TeamPlayerSelector, ConfirmationModal } from '@/components';
import { HorizontalScoreEntryModal, SyncConflictModal } from '@/components/gameResults';
import { OutcomeExplanationModal } from '@/components/OutcomeExplanationModal';
import { ModalType } from '@/hooks/useModalManager';
import { Game, BasicUser } from '@/types';
import { Round } from '@/types/gameResults';
import { getRestartTitle, getFinishTitle, getEditTitle } from '@/utils/gameResultsHelpers';

interface GameResultsModalsProps {
  modal: ModalType;
  rounds: Round[];
  players: BasicUser[];
  currentGame: Game | null;
  expandedRoundId: string | null;
  effectiveHorizontalLayout: boolean;
  onClose: () => void;
  onUpdateSetResult: (roundId: string, matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => Promise<void>;
  onRemoveSet: (roundId: string, matchId: string, setIndex: number) => Promise<void>;
  onPlayerSelect: (playerId: string) => Promise<void>;
  onCourtSelect: (courtId: string) => Promise<void>;
  onRestart: () => Promise<void>;
  onFinish: () => Promise<void>;
  onEdit: () => Promise<void>;
  onSyncToServerFirst: () => Promise<void>;
  onEraseAndLoadFromServer: () => Promise<void>;
  isResolvingConflict: boolean;
}

export const GameResultsModals = ({
  modal,
  rounds,
  players,
  currentGame,
  expandedRoundId,
  effectiveHorizontalLayout,
  onClose,
  onUpdateSetResult,
  onRemoveSet,
  onPlayerSelect,
  onCourtSelect,
  onRestart,
  onFinish,
  onEdit,
  onSyncToServerFirst,
  onEraseAndLoadFromServer,
  isResolvingConflict,
}: GameResultsModalsProps) => {
  const { t } = useTranslation();

  if (!modal) return null;

  if (modal.type === 'set') {
    const round = rounds.find(r => r.id === modal.roundId);
    const match = round?.matches.find(m => m.id === modal.matchId);
    if (!match || !round) return null;

    const canRemove = (() => {
      const currentSet = match.sets[modal.setIndex];
      if (!currentSet) return false;
      const isLastSet = modal.setIndex === match.sets.length - 1;
      const isZeroZero = currentSet.teamA === 0 && currentSet.teamB === 0;
      return match.sets.length > 1 && !(isLastSet && isZeroZero);
    })();

    const modalContent = effectiveHorizontalLayout ? (
      <HorizontalScoreEntryModal
        key={`horizontal-${modal.matchId}-${modal.setIndex}`}
        match={match}
        setIndex={modal.setIndex}
        players={players}
        maxTotalPointsPerSet={currentGame?.maxTotalPointsPerSet}
        maxPointsPerTeam={currentGame?.maxPointsPerTeam}
        fixedNumberOfSets={currentGame?.fixedNumberOfSets}
        onSave={(matchId, setIndex, teamAScore, teamBScore) => {
          onUpdateSetResult(modal.roundId, matchId, setIndex, teamAScore, teamBScore);
        }}
        onRemove={(matchId, setIndex) => {
          onRemoveSet(modal.roundId, matchId, setIndex);
        }}
        onClose={onClose}
        canRemove={canRemove}
      />
    ) : (
      <SetResultModal
        match={match}
        setIndex={modal.setIndex}
        players={players}
        maxTotalPointsPerSet={currentGame?.maxTotalPointsPerSet}
        maxPointsPerTeam={currentGame?.maxPointsPerTeam}
        fixedNumberOfSets={currentGame?.fixedNumberOfSets}
        onSave={(matchId, setIndex, teamAScore, teamBScore) => {
          onUpdateSetResult(modal.roundId, matchId, setIndex, teamAScore, teamBScore);
        }}
        onRemove={(matchId, setIndex) => {
          onRemoveSet(modal.roundId, matchId, setIndex);
        }}
        onClose={onClose}
        canRemove={canRemove}
      />
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
  }

  if (modal.type === 'player') {
    const roundId = modal.matchTeam.roundId || expandedRoundId || (rounds.length > 0 ? rounds[0].id : null);
    const round = roundId ? rounds.find(r => r.id === roundId) : null;
    
    const selectedPlayerIds = round ? (() => {
      const playersInRound = new Set<string>();
      round.matches.forEach((match: { teamA: string[]; teamB: string[] }) => {
        match.teamA.forEach((id: string) => playersInRound.add(id));
        match.teamB.forEach((id: string) => playersInRound.add(id));
      });
      return Array.from(playersInRound);
    })() : [];

    return (
      <TeamPlayerSelector
        gameParticipants={currentGame?.participants || []}
        onClose={onClose}
        onConfirm={onPlayerSelect}
        selectedPlayerIds={selectedPlayerIds}
        title={t('games.addPlayer')}
      />
    );
  }

  if (modal.type === 'court') {
    const round = rounds.find((r: Round) => r.id === modal.match.roundId);
    const match = round?.matches.find((m: { id: string }) => m.id === modal.match.matchId);
    
    return (
      <CourtModal
        isOpen={true}
        onClose={onClose}
        courts={currentGame?.gameCourts?.map(gc => gc.court) || []}
        selectedId={match?.courtId || ''}
        onSelect={onCourtSelect}
        entityType="GAME"
        showNotBookedOption={false}
      />
    );
  }

  if (modal.type === 'restart') {
    return (
      <ConfirmationModal
        isOpen={true}
        title={getRestartTitle(currentGame, t)}
        message={t('gameResults.restartConfirmationMessage')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={onRestart}
        onClose={onClose}
      />
    );
  }

  if (modal.type === 'finish') {
    return (
      <ConfirmationModal
        isOpen={true}
        title={getFinishTitle(currentGame, t)}
        message={t('gameResults.finishConfirmationMessage')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
        onConfirm={onFinish}
        onClose={onClose}
      />
    );
  }

  if (modal.type === 'edit') {
    return (
      <ConfirmationModal
        isOpen={true}
        title={getEditTitle(currentGame, t)}
        message={t('gameResults.editConfirmationMessage')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={onEdit}
        onClose={onClose}
      />
    );
  }

  if (modal.type === 'syncConflict' && typeof document !== 'undefined') {
    return createPortal(
      <SyncConflictModal
        isOpen={true}
        onSyncToServer={onSyncToServerFirst}
        onLoadFromServer={onEraseAndLoadFromServer}
        onClose={() => {}}
        isSyncing={isResolvingConflict}
        isLoading={isResolvingConflict}
      />,
      document.body
    );
  }

  if (modal.type === 'explanation' && typeof document !== 'undefined') {
    return createPortal(
      <OutcomeExplanationModal
        explanation={modal.explanation}
        playerName={modal.playerName}
        levelBefore={modal.levelBefore}
        onClose={onClose}
      />,
      document.body
    );
  }

  return null;
};

