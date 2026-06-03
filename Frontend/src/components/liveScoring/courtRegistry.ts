import type { ComponentType } from 'react';
import type { LiveScoringUiId } from '@/liveScoring/registry';
import type { LiveScoringPlugin } from '@/liveScoring/registry';
import type { ServeCourtProps } from './ServeCourtProps';
import { TennisServeCourtSchema } from './TennisServeCourtSchema';
import type { RallyCourtProps } from './rally/RallyCourtProps';
import { TableTennisCourt } from './rally/TableTennisCourt';
import { TableTennisServeCourtSchema } from './TableTennisServeCourtSchema';
import { BadmintonServeCourtSchema } from './BadmintonServeCourtSchema';
import { PickleballServeCourtSchema } from './PickleballServeCourtSchema';
import { PadelServeCourtSchema } from './PadelServeCourtSchema';
import { PadelCourt } from './rally/PadelCourt';
import { SquashServeCourtSchema } from './SquashServeCourtSchema';
import { PD_SCENE_VB_H, PD_SCENE_VB_W } from './rally/padelCourtLayout';
import { BadmintonCourt } from './rally/BadmintonCourt';
import { PickleballCourt } from './rally/PickleballCourt';
import { SquashCourt } from './rally/SquashCourt';
import { BD_SCENE_VB_H, BD_SCENE_VB_W } from './rally/badmintonCourtLayout';
import { PB_SCENE_VB_H, PB_SCENE_VB_W } from './rally/pickleballCourtLayout';
import { SQ_VB_H, SQ_VB_W } from './rally/squashCourtLayout';
import { TT_SCENE_VB_H, TT_SCENE_VB_W } from './rally/tableTennisCourtLayout';
import { TN_SCENE_VB_H, TN_SCENE_VB_W } from './rally/tennisCourtLayout';

export function liveCourtAspectForUiId(uiId: LiveScoringUiId): readonly [number, number] | null {
  switch (uiId) {
    case 'table-tennis-board':
      return [TT_SCENE_VB_W, TT_SCENE_VB_H];
    case 'badminton-board':
      return [BD_SCENE_VB_W, BD_SCENE_VB_H];
    case 'pickleball-board':
      return [PB_SCENE_VB_W, PB_SCENE_VB_H];
    case 'squash-board':
      return [SQ_VB_W, SQ_VB_H];
    case 'padel-court':
      return [PD_SCENE_VB_W, PD_SCENE_VB_H];
    case 'tennis-court':
      return [TN_SCENE_VB_W, TN_SCENE_VB_H];
    case 'americano-points':
      return null;
  }
}

export function resolveCourtSchemaComponent(uiId: LiveScoringUiId): ComponentType<ServeCourtProps> | null {
  switch (uiId) {
    case 'tennis-court':
      return TennisServeCourtSchema;
    case 'table-tennis-board':
      return TableTennisServeCourtSchema;
    case 'badminton-board':
      return BadmintonServeCourtSchema;
    case 'pickleball-board':
      return PickleballServeCourtSchema;
    case 'squash-board':
      return SquashServeCourtSchema;
    case 'padel-court':
      return PadelServeCourtSchema;
    case 'americano-points':
      return null;
  }
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
    case 'padel-court':
      return PadelCourt;
    case 'tennis-court':
    case 'americano-points':
      return null;
  }
}

export function resolveRallyCourtForPlugin(plugin: LiveScoringPlugin): ComponentType<RallyCourtProps> | null {
  return resolveRallyCourtComponent(plugin.uiId);
}
