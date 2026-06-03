import { bdNetScreenDimensions } from './badmintonCourtLayout';
import { tnNetScreenDimensions } from './tennisCourtLayout';
import { ttNetScreenDimensions } from './tableTennisCourtLayout';

export type RallyCourtNetVariant = 'padel' | 'pickleball' | 'tennis' | 'tableTennis' | 'badminton';

type Pt = { x: number; y: number };

export type RallyCourtNetLayout = {
  left: Pt;
  right: Pt;
  floorY: number;
  span: number;
  centerX: number;
  meshH?: number;
  postH?: number;
  tapeH?: number;
  postW?: number;
  meshBottomOffset?: number;
};

export type RallyCourtNetDims = {
  meshH: number;
  postH: number;
  tapeH: number;
  postW: number;
  meshBottomOffset: number;
};

export type RallyCourtNetPostStyle = 'metal' | 'dark' | 'wood';

export type RallyCourtNetPreset = {
  dims: (span: number) => RallyCourtNetDims;
  postStyle: RallyCourtNetPostStyle;
  tapeAtPostTop: boolean;
  shadowRy: number;
  shadowOffsetY: number;
  patternScale: number | 'auto';
};

const PADEL_DIMS: RallyCourtNetDims = {
  postW: 2.6,
  postH: 13,
  tapeH: 1.6,
  meshH: 8.5,
  meshBottomOffset: 0,
};

const PICKLEBALL_DIMS: RallyCourtNetDims = {
  postW: 3,
  postH: 13,
  tapeH: 1.6,
  meshH: 8.5,
  meshBottomOffset: 0,
};

export const RALLY_COURT_NET_PRESETS: Record<RallyCourtNetVariant, RallyCourtNetPreset> = {
  padel: {
    dims: () => PADEL_DIMS,
    postStyle: 'metal',
    tapeAtPostTop: false,
    shadowRy: 2,
    shadowOffsetY: 2.2,
    patternScale: 2.5,
  },
  pickleball: {
    dims: () => PICKLEBALL_DIMS,
    postStyle: 'metal',
    tapeAtPostTop: false,
    shadowRy: 2,
    shadowOffsetY: 2.2,
    patternScale: 2.5,
  },
  tennis: {
    dims: (span) => tnNetScreenDimensions(span),
    postStyle: 'dark',
    tapeAtPostTop: false,
    shadowRy: 1.8,
    shadowOffsetY: 1.8,
    patternScale: 'auto',
  },
  tableTennis: {
    dims: (span) => ({ ...ttNetScreenDimensions(span), meshBottomOffset: 0 }),
    postStyle: 'metal',
    tapeAtPostTop: true,
    shadowRy: 1.1,
    shadowOffsetY: 1.1,
    patternScale: 'auto',
  },
  badminton: {
    dims: (span) => bdNetScreenDimensions(span),
    postStyle: 'wood',
    tapeAtPostTop: false,
    shadowRy: 1.8,
    shadowOffsetY: 1.8,
    patternScale: 'auto',
  },
};

export function rallyCourtNetDims(
  variant: RallyCourtNetVariant,
  net: RallyCourtNetLayout
): RallyCourtNetDims {
  const preset = RALLY_COURT_NET_PRESETS[variant].dims(net.span);
  return {
    meshH: net.meshH ?? preset.meshH,
    postH: net.postH ?? preset.postH,
    tapeH: net.tapeH ?? preset.tapeH,
    postW: net.postW ?? preset.postW,
    meshBottomOffset: net.meshBottomOffset ?? preset.meshBottomOffset,
  };
}

export function rallyCourtNetPatternSize(meshH: number, preset: RallyCourtNetPreset): number {
  if (preset.patternScale !== 'auto') return preset.patternScale;
  return Math.max(1.8, Math.min(2.8, meshH / 3.5));
}
