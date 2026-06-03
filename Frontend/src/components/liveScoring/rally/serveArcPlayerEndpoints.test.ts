import { describe, expect, it } from 'vitest';
import { serveArcStopBeforeTarget } from './serveArcGeometry';
import {
  serveArcReceiverTeam,
  serveArcTraceEndpoints,
  serveArcTraceEndpointsFeetAnchored,
  serveArcTraceEndpointsPadel,
} from './serveArcPlayerEndpoints';

describe('serveArcPlayerEndpoints', () => {
  it('resolves receiver team from server end', () => {
    expect(serveArcReceiverTeam('bottom', 'teamB', 'teamA')).toBe('teamB');
  });

  it('starts at ball and stops before receiver avatar', () => {
    const ball = { x: 50, y: 160 };
    const slots = [
      { px: 50, py: 140, team: 'teamA' as const, idx: 0, avatarScale: 1 },
      { px: 70, py: 40, team: 'teamB' as const, idx: 0, avatarScale: 1.2 },
    ];
    const arc = serveArcTraceEndpoints(ball, slots, 'teamB', 0);
    expect(arc?.from).toEqual(ball);
    const distToReceiver = Math.hypot(arc!.to.x - 70, arc!.to.y - 40);
    expect(distToReceiver).toBeGreaterThan(12 * 1.2);
    expect(distToReceiver).toBeLessThan(Math.hypot(50 - 70, 160 - 40));
  });

  it('feet-anchored arc reaches receiver side of court but stops before feet', () => {
    const ball = { x: 40, y: 50 };
    const netY = 112;
    const slots = [
      { px: 70, py: 175, team: 'teamB' as const, idx: 0, avatarScale: 1.35 },
    ];
    const center = serveArcTraceEndpoints(ball, slots, 'teamB', 0);
    const feet = serveArcTraceEndpointsFeetAnchored(ball, slots, 'teamB', 0);
    expect(feet?.from).toEqual(ball);
    expect(feet!.to.y).toBeGreaterThan(netY);
    expect(feet!.to.y).toBeLessThan(175);
    expect(feet!.to.y).toBeGreaterThan(158);
    expect(feet!.to.y).toBeGreaterThan(center!.to.y);
  });

  it('padel arc reaches near receiver, not short of the net', () => {
    const ball = { x: 50, y: 45 };
    const netY = 112;
    const flatEnd = { x: 68, y: 168 };
    const slots = [
      { px: 72, py: 178, team: 'teamB' as const, idx: 0, avatarScale: 1.4 },
    ];
    const arc = serveArcTraceEndpointsPadel(ball, flatEnd, slots, 'teamB', 0);
    expect(arc?.from).toEqual(ball);
    expect(arc!.to.y).toBeGreaterThan(netY + 15);
    expect(arc!.to.y).toBeLessThan(178);
    const distRecv = Math.hypot(arc!.to.x - 72, arc!.to.y - 178);
    expect(distRecv).toBeGreaterThan(12);
    expect(distRecv).toBeLessThan(35);
  });

  it('serveArcStopBeforeTarget stays on the ball-to-target chord', () => {
    const from = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    const stop = serveArcStopBeforeTarget(from, target, { targetRadius: 10, margin: 0 });
    expect(stop.y).toBeCloseTo(0, 5);
    expect(stop.x).toBeCloseTo(90, 5);
  });
});
