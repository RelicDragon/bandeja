import type { ComponentType } from 'react';
import type { LiveScoringUiId } from '@/liveScoring/registry';
import { isRallyLiveScoringPlugin, type LiveScoringPlugin } from '@/liveScoring/registry';
import { ServeCourtSchema, type ServeCourtSchemaProps } from './ServeCourtSchema';
import { TennisServeCourtSchema } from './TennisServeCourtSchema';
import type { RallyCourtProps } from './rally/RallyCourtProps';
import { TableTennisCourt } from './rally/TableTennisCourt';
import { TableTennisServeCourtSchema } from './TableTennisServeCourtSchema';
import { BadmintonServeCourtSchema } from './BadmintonServeCourtSchema';
import { PickleballServeCourtSchema } from './PickleballServeCourtSchema';
import { BadmintonCourt } from './rally/BadmintonCourt';
import { PickleballCourt } from './rally/PickleballCourt';
import { SquashCourt } from './rally/SquashCourt';

export function resolveCourtSchemaComponent(uiId: LiveScoringUiId): ComponentType<ServeCourtSchemaProps> {
  if (uiId === 'tennis-court') return TennisServeCourtSchema;
  if (uiId === 'table-tennis-board') return TableTennisServeCourtSchema;
  if (uiId === 'badminton-board') return BadmintonServeCourtSchema;
  if (uiId === 'pickleball-board') return PickleballServeCourtSchema;
  return ServeCourtSchema;
}

export function resolveRallyCourtComponent(uiId: LiveScoringUiId): ComponentType<RallyCourtProps> | null {
  switch (uiId) {
    case 'table-tennis-board':
      return TableTennisCourt;
    case 'badminton-board':
      return BadmintonCourt;
    case 'pickleball-board':
      return PickleballCourt;
    case 'squash-board':
      return SquashCourt;
    default:
      return null;
  }
}

export function resolveRallyCourtForPlugin(plugin: LiveScoringPlugin): ComponentType<RallyCourtProps> | null {
  if (!isRallyLiveScoringPlugin(plugin)) return null;
  return resolveRallyCourtComponent(plugin.uiId);
}
