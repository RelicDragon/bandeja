import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import type { CreateFlowIntent, CreateTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import type { Game } from '@/types';
import type { GameFormatTemplateSnapshot } from '@/utils/gameFormat/gameFormatSnapshot';
import { inferTemplateFromFormat } from '@/utils/gameFormat/templateFormatCoordinator';

export function inferCreateTemplateFromGame(
  sport: Sport,
  allowedScoringPresets: ScoringPreset[],
  participantContext: CreateTemplateParticipantContext,
  game: Partial<Game>,
  formatSnapshot?: GameFormatTemplateSnapshot,
): { intent: CreateFlowIntent; templateId: CreateTemplateId | null } {
  return inferTemplateFromFormat(
    {
      sport,
      maxParticipants: participantContext.maxParticipants,
      allowedScoringPresets,
      participantContext,
    },
    game,
    formatSnapshot,
  );
}
