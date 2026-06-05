import type { EntityType } from '@/types';
import { isCasualCreateFlowEnabled } from '@/sport/createFlow';
import { Sports, type Sport } from '@shared/sport';

export function showGameFormatTemplatePicker(
  entityType: EntityType,
  sport: Sport,
  enabledSports: Sport[],
): boolean {
  if (entityType !== 'GAME' && entityType !== 'LEAGUE') return false;
  const casualCreateFlow = isCasualCreateFlowEnabled(entityType, enabledSports);
  return casualCreateFlow || sport === Sports.PADEL;
}
