import type { CSSProperties } from 'react';
import type { LiveScoringUiId } from '@/liveScoring/registry';
import { BD_SCENE_VB_H, BD_SCENE_VB_W } from './rally/badmintonCourtLayout';
import { PB_SCENE_VB_H, PB_SCENE_VB_W } from './rally/pickleballCourtLayout';
import { SQ_SCENE_VB_H, SQ_SCENE_VB_W } from './rally/squashCourtLayout';
import { PD_SCENE_VB_H, PD_SCENE_VB_W } from './rally/padelCourtLayout';
import { ttServeGuideFrameAspect } from './rally/tableTennisCourtLayout';
import { TN_SCENE_VB_H, TN_SCENE_VB_W } from './rally/tennisCourtLayout';

const CLASSIC_VB_W = 100;
const CLASSIC_VB_H = 200;

export type ServeGuideFrameSpec = {
  className: string;
  style: CSSProperties;
};

/** Width-first frame: height follows scene aspect (avoids squish from fixed h + max-w-full). */
export function serveGuideFrameSpec(
  aspectW: number,
  aspectH: number,
  widthRem: number,
  smWidthRem?: number,
): ServeGuideFrameSpec {
  const sm = smWidthRem ?? widthRem + 0.75;
  return {
    className: `shrink-0 w-[min(100%,${widthRem}rem)] sm:w-[min(100%,${sm}rem)]`,
    style: { aspectRatio: `${aspectW} / ${aspectH}` },
  };
}

export function serveGuideFrameForUiId(
  uiId: LiveScoringUiId,
  variant: 'coach' | 'setup',
): ServeGuideFrameSpec {
  const setup = variant === 'setup';
  switch (uiId) {
    case 'badminton-board':
      return serveGuideFrameSpec(BD_SCENE_VB_W, BD_SCENE_VB_H, setup ? 7.25 : 7.5);
    case 'pickleball-board':
      return serveGuideFrameSpec(PB_SCENE_VB_W, PB_SCENE_VB_H, setup ? 7.25 : 7.5);
    case 'table-tennis-board': {
      const [ttW, ttH] = ttServeGuideFrameAspect();
      return serveGuideFrameSpec(ttW, ttH, setup ? 10 : 11, setup ? 10.75 : 11.75);
    }
    case 'squash-board':
      return serveGuideFrameSpec(SQ_SCENE_VB_W, SQ_SCENE_VB_H, setup ? 8.5 : 9);
    case 'tennis-court':
      return serveGuideFrameSpec(TN_SCENE_VB_W, TN_SCENE_VB_H, setup ? 7.25 : 7.5, setup ? 7.75 : 8);
    case 'padel-court':
      return serveGuideFrameSpec(PD_SCENE_VB_W, PD_SCENE_VB_H, setup ? 7.25 : 7.5);
    default:
      return serveGuideFrameSpec(CLASSIC_VB_W, CLASSIC_VB_H, setup ? 5.75 : 6.75, setup ? 6.25 : 7.5);
  }
}
