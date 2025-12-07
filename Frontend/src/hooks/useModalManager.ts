import { useState, useCallback } from 'react';

export type ModalType =
  | { type: 'set'; roundId: string; matchId: string; setIndex: number }
  | { type: 'player'; matchTeam: { roundId?: string; matchId: string; team: 'teamA' | 'teamB' } }
  | { type: 'court'; match: { roundId: string; matchId: string } }
  | { type: 'restart' }
  | { type: 'finish' }
  | { type: 'edit' }
  | { type: 'setup' }
  | { type: 'syncConflict' }
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

