import { useState, useCallback } from 'react';
import { OutcomeExplanation } from '@/api/results';

export type ModalType =
  | { type: 'set'; roundId: string; matchId: string; setIndex: number }
  | { type: 'player'; matchTeam: { roundId?: string; matchId: string; team: 'teamA' | 'teamB' } }
  | { type: 'court'; match: { roundId: string; matchId: string } }
  | { type: 'restart' }
  | { type: 'finish' }
  | { type: 'edit' }
  | { type: 'syncConflict' }
  | { type: 'explanation'; explanation: OutcomeExplanation; playerName: string; levelBefore: number }
  | null;

export const useModalManager = () => {
  const [modal, setModal] = useState<ModalType>(null);

  const openModal = useCallback((modalData: ModalType) => {
    setModal(modalData);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  return {
    modal,
    openModal,
    closeModal,
  };
};

