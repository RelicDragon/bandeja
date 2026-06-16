import type { EntityType } from '@/types';
import { getCreateFlowConfig, isCasualCreateFlowEnabled } from '@/sport/createFlow';
import { Sports, type Sport } from '@shared/sport';
import { isSportCreatable } from '@/config/multisportFlags';

export function showGameFormatTemplatePicker(
  entityType: EntityType,
  sport: Sport,
): boolean {
  if (entityType !== 'GAME' && entityType !== 'LEAGUE') return false;
  if (sport === Sports.PADEL) return true;
  if (!isSportCreatable(sport)) return false;
  const hasTemplates = getCreateFlowConfig(sport).createTemplates.length > 0;
  if (hasTemplates) return true;
  return isCasualCreateFlowEnabled(entityType);
}
