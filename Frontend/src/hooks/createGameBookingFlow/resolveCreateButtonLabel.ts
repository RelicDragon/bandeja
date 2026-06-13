import type { EntityType } from '@/types';
import type { TFunction } from 'i18next';

export function resolveCreateButtonLabel(input: {
  t: TFunction;
  entityType: EntityType;
  needsBooktimeAuth: boolean;
  willBookOnCreate: boolean;
  integratedCourtCount: number;
}): string {
  if (input.needsBooktimeAuth) {
    return input.t('createGame.booktime.signInToContinue');
  }
  if (input.willBookOnCreate && input.integratedCourtCount > 0) {
    return input.t('createGame.booktime.createCta');
  }
  if (input.entityType === 'TOURNAMENT') return input.t('createGame.createButtonTournament');
  if (input.entityType === 'LEAGUE') return input.t('createGame.createButtonLeague');
  if (input.entityType === 'BAR') return input.t('createGame.createButtonBar');
  if (input.entityType === 'TRAINING') return input.t('createGame.createButtonTraining');
  return input.t('createGame.createButton');
}
