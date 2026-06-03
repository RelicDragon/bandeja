import { describe, expect, it } from 'vitest';
import type { BasicUser } from '@/types';
import {
  PADEL_BACK_COURT_M,
  PADEL_NET_Y,
  PADEL_SERVICE_DEPTH_M,
  PADEL_SERVICE_FROM_NET,
  PADEL_SURFACE,
  PADEL_UNITS_PER_M,
  PADEL_VB_H,
  PADEL_VB_W,
  PD_CENTER_X,
  PD_SERVICE_BOTTOM_Y,
  PD_SERVICE_TOP_Y,
  PD_Y_BASELINE_TOP,
  PD_X_L,
  PD_X_R,
  PD_Y_BASELINE_BOTTOM,
  pdFlatPlayerSlots,
  pdServeArcReceiverPlayerIndex,
  pdReceiveTargetYForEnd,
  pdReceiverStandYForEnd,
  pdServeFlatPoints,
  pdServiceBoxRect,
} from './padelCourtGeometry';

const u = (id: string): BasicUser => ({
  id,
  firstName: id,
  lastName: '',
  avatarUrl: null,
});

describe('padelCourtGeometry', () => {
  it('uses FIP proportions (6.95 m service box, 3.05 m back court)', () => {
    expect(PADEL_VB_W / PADEL_UNITS_PER_M).toBe(10);
    expect(PADEL_VB_H / PADEL_UNITS_PER_M).toBe(20);
    expect(PADEL_SERVICE_FROM_NET / PADEL_UNITS_PER_M).toBe(PADEL_SERVICE_DEPTH_M);
    expect(PADEL_BACK_COURT_M).toBeCloseTo(3.05, 2);

    expect(PADEL_NET_Y - PD_SERVICE_TOP_Y).toBe(PADEL_SERVICE_FROM_NET);
    expect(PD_SERVICE_BOTTOM_Y - PADEL_NET_Y).toBe(PADEL_SERVICE_FROM_NET);
    expect(PD_SERVICE_TOP_Y / PADEL_UNITS_PER_M).toBeCloseTo(3.05, 2);
  });

  it('service box rect spans service line to net only', () => {
    const top = pdServiceBoxRect('top', 'left');
    expect(top.y).toBe(PD_SERVICE_TOP_Y);
    expect(top.h).toBe(PADEL_NET_Y - PD_SERVICE_TOP_Y);
    expect(top.h / PADEL_UNITS_PER_M).toBeCloseTo(6.95, 2);

    const bottom = pdServiceBoxRect('bottom', 'right');
    expect(bottom.y).toBe(PADEL_NET_Y);
    expect(bottom.h).toBe(PD_SERVICE_BOTTOM_Y - PADEL_NET_Y);
  });

  it('playing surface fills the 10×20 m viewBox', () => {
    expect(PADEL_SURFACE).toEqual({ x: 0, y: 0, w: PADEL_VB_W, h: PADEL_VB_H });
  });

  it('avatar scale grows toward near POV baseline', async () => {
    const { pdAvatarScaleFromFlatY, pdAvatarScaleFromScreenY, pdProjectFlat } = await import(
      './padelCourtLayout'
    );
    const farFlat = pdAvatarScaleFromFlatY(PD_Y_BASELINE_TOP);
    const nearFlat = pdAvatarScaleFromFlatY(PD_Y_BASELINE_BOTTOM);
    expect(nearFlat).toBeGreaterThan(farFlat);
    expect(farFlat).toBeCloseTo(1, 5);
    const farScreen = pdProjectFlat(PD_CENTER_X, PD_Y_BASELINE_TOP);
    const nearScreen = pdProjectFlat(PD_CENTER_X, PD_Y_BASELINE_BOTTOM);
    expect(pdAvatarScaleFromScreenY(nearScreen.y)).toBeGreaterThan(pdAvatarScaleFromScreenY(farScreen.y));
  });

  it('places serve ball between server baseline and service line (toward net)', () => {
    const topBase = PD_Y_BASELINE_TOP;
    const topBall = pdServeFlatPoints({
      serverTeam: 'teamB',
      courtSide: 'rightDeuce',
      courtEndsSwapped: false,
      matchDoubles: false,
    }).start.y;
    expect(topBall).toBeGreaterThan(topBase);

    const bottomBase = PD_Y_BASELINE_BOTTOM;
    const bottomBall = pdServeFlatPoints({
      serverTeam: 'teamA',
      courtSide: 'rightDeuce',
      courtEndsSwapped: false,
      matchDoubles: false,
    }).start.y;
    expect(bottomBall).toBeLessThan(bottomBase);
  });

  it('serve arc lands in service box in front of receiver baseline', () => {
    const flat = pdServeFlatPoints({
      serverTeam: 'teamB',
      courtSide: 'rightDeuce',
      courtEndsSwapped: false,
      matchDoubles: false,
    });
    expect(flat.end.y).toBe(pdReceiveTargetYForEnd('bottom'));
    expect(flat.end.y).toBeLessThan(PD_Y_BASELINE_BOTTOM);
    expect(flat.end.y).toBeGreaterThan(PD_SERVICE_BOTTOM_Y);
  });

  it('keeps server and receiver on diagonal boxes when ends are swapped', () => {
    const slots = pdFlatPlayerSlots({
      teamAPlayers: [u('a')],
      teamBPlayers: [u('b')],
      courtEndsSwapped: true,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
      serverTeam: 'teamB',
      serverPlayerIndex: 0,
      courtSide: 'rightDeuce',
      matchDoubles: false,
      endsSetup: false,
      layoutServe: true,
    });
    const server = slots.find((s) => s.team === 'teamB');
    const receiver = slots.find((s) => s.team === 'teamA');
    expect(server?.x).not.toBe(receiver?.x);
    const flat = pdServeFlatPoints({
      serverTeam: 'teamB',
      courtSide: 'rightDeuce',
      courtEndsSwapped: true,
      matchDoubles: false,
    });
    expect(flat.start.x).toBe(server?.x);
    expect(flat.end.x).toBe(receiver?.x);
  });

  it('pulls far-side receiver toward net when server is near POV', () => {
    const slots = pdFlatPlayerSlots({
      teamAPlayers: [u('a')],
      teamBPlayers: [u('b')],
      courtEndsSwapped: false,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
      serverTeam: 'teamA',
      serverPlayerIndex: 0,
      courtSide: 'rightDeuce',
      matchDoubles: false,
      endsSetup: false,
      layoutServe: true,
    });
    const receiver = slots.find((s) => s.team === 'teamB');
    expect(receiver?.y).toBe(pdReceiverStandYForEnd('top'));
    expect(receiver!.y).toBeGreaterThan(PD_Y_BASELINE_TOP);
    expect(receiver!.y).toBeLessThan(PD_SERVICE_TOP_Y);
  });

  it('spreads doubles partners on baseline during ends setup', () => {
    const slots = pdFlatPlayerSlots({
      teamAPlayers: [u('a0'), u('a1')],
      teamBPlayers: [u('b0'), u('b1')],
      courtEndsSwapped: false,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
      serverTeam: 'teamA',
      serverPlayerIndex: 0,
      courtSide: 'rightDeuce',
      matchDoubles: true,
      endsSetup: true,
      layoutServe: true,
    });
    const top = slots.filter((s) => s.team === 'teamB');
    const bottom = slots.filter((s) => s.team === 'teamA');
    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    expect(top[0]!.x).not.toBe(top[1]!.x);
    expect(bottom[0]!.x).not.toBe(bottom[1]!.x);
    expect(top[0]!.x).toBe(PD_X_R);
    expect(top[1]!.x).toBe(PD_X_L);
    expect(top[0]!.y).toBe(pdReceiverStandYForEnd('top'));
    expect(top[0]!.y).toBeGreaterThan(PD_Y_BASELINE_TOP);
    expect(bottom[0]!.y).toBe(PD_Y_BASELINE_BOTTOM);
  });

  it('targets diagonal receiver in doubles when serving from deuce', () => {
    const recvIdx = pdServeArcReceiverPlayerIndex({
      receiverTeam: 'teamA',
      westServe: true,
      matchDoubles: true,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
    });
    const slots = pdFlatPlayerSlots({
      teamAPlayers: [u('a0'), u('a1')],
      teamBPlayers: [u('b0'), u('b1')],
      courtEndsSwapped: false,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
      serverTeam: 'teamB',
      serverPlayerIndex: 0,
      courtSide: 'rightDeuce',
      matchDoubles: true,
      endsSetup: false,
      layoutServe: true,
    });
    const server = slots.find((s) => s.team === 'teamB' && s.idx === 0);
    const receiver = slots.find((s) => s.team === 'teamA' && s.idx === recvIdx);
    expect(server?.x).toBe(PD_X_R);
    expect(receiver?.x).toBe(PD_X_L);
    expect(server?.x).not.toBe(receiver?.x);

    const flat = pdServeFlatPoints({
      serverTeam: 'teamB',
      courtSide: 'rightDeuce',
      courtEndsSwapped: false,
      matchDoubles: true,
      serverPlayerIndex: 0,
    });
    expect(flat.start.x).toBe(PD_X_R);
    expect(flat.end.x).toBe(PD_X_L);
  });

  it('places singles receiver in diagonal service box, not center', () => {
    const slots = pdFlatPlayerSlots({
      teamAPlayers: [u('a')],
      teamBPlayers: [u('b')],
      courtEndsSwapped: false,
      courtTeamASidesMirrored: false,
      courtTeamBSidesMirrored: false,
      serverTeam: 'teamB',
      serverPlayerIndex: 0,
      courtSide: 'rightDeuce',
      matchDoubles: false,
      endsSetup: false,
      layoutServe: true,
    });
    const receiver = slots.find((s) => s.team === 'teamA');
    const server = slots.find((s) => s.team === 'teamB');
    expect(receiver?.x).toBe(PD_X_R);
    expect(receiver?.x).not.toBe(PD_CENTER_X);
    expect(server?.x).toBe(PD_X_L);
    expect(receiver?.y).toBe(PD_Y_BASELINE_BOTTOM);
    expect(server?.y).toBeGreaterThan(PD_Y_BASELINE_TOP);
    expect(server?.y).toBeLessThan(PD_SERVICE_TOP_Y);
  });
});
