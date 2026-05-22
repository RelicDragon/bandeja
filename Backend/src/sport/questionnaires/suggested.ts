import { Sport } from '@prisma/client';
import { getSportConfig } from '../sportRegistry';
import { isQuestionnaireEngineEnabled } from '../../utils/multisportQuestionnaireFlags';

export function isQuestionnaireSuggestedForProfile(
  sport: Sport,
  profile:
    | {
        questionnaireCompletedAt?: Date | null;
        questionnaireSkippedAt?: Date | null;
      }
    | null
    | undefined,
): boolean {
  if (!getSportConfig(sport).questionnaire) return false;
  if (!isQuestionnaireEngineEnabled()) return false;
  if (!profile) return true;
  if (profile.questionnaireCompletedAt) return false;
  if (profile.questionnaireSkippedAt) return false;
  return true;
}
