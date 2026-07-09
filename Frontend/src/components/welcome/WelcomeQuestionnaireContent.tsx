import { Sports } from '@shared/sport';
import { SportQuestionnaireContent } from '@/components/sportQuestionnaire/SportQuestionnaireContent';

export interface WelcomeQuestionnaireContentProps {
  onRequestClose: () => void;
}

export function WelcomeQuestionnaireContent({ onRequestClose }: WelcomeQuestionnaireContentProps) {
  return (
    <SportQuestionnaireContent sport={Sports.PADEL} onRequestClose={onRequestClose} showStartOver />
  );
}
