import type { LiveTeamSide } from '@/utils/liveScoring';
import { serveArcStopBeforeTarget, type ServeArcPt } from './serveArcGeometry';

export type ServeArcProjectedSlot = {
  px: number;
  py: number;
  team: LiveTeamSide;
  idx: number;
  avatarScale?: number;
};

/** {@link ServeCourtPlayerAvatar} box height at scale 1 (face + ground shadow). */
const SERVE_COURT_AVATAR_H_PX = 29;

export function serveArcReceiverTeam(
  serverEnd: 'top' | 'bottom',
  topTeam: LiveTeamSide,
  bottomTeam: LiveTeamSide
): LiveTeamSide {
  return serverEnd === 'top' ? bottomTeam : topTeam;
}

/** Arc from ball contact to a point just before the receiver avatar. */
export function serveArcTraceEndpoints(
  ball: ServeArcPt,
  slots: ServeArcProjectedSlot[],
  receiverTeam: LiveTeamSide,
  receiverPlayerIndex: number
): { from: ServeArcPt; to: ServeArcPt } | null {
  const receiver = slots.find((s) => s.team === receiverTeam && s.idx === receiverPlayerIndex);
  if (!receiver) return null;
  const target = { x: receiver.px, y: receiver.py };
  const targetRadius = 12 * (receiver.avatarScale ?? 1);
  return {
    from: ball,
    to: serveArcStopBeforeTarget(ball, target, { targetRadius }),
  };
}

/**
 * Feet-anchored avatars (`-translate-y-full`): chord ball → receiver feet, pull back along that
 * line (sprite height) so the tip lands in the service box — not on the net, not on the face.
 */
export function serveArcTraceEndpointsFeetAnchored(
  ball: ServeArcPt,
  slots: ServeArcProjectedSlot[],
  receiverTeam: LiveTeamSide,
  receiverPlayerIndex: number
): { from: ServeArcPt; to: ServeArcPt } | null {
  const receiver = slots.find((s) => s.team === receiverTeam && s.idx === receiverPlayerIndex);
  if (!receiver) return null;
  const s = receiver.avatarScale ?? 1;
  const bodyH = SERVE_COURT_AVATAR_H_PX * s;
  const target = { x: receiver.px, y: receiver.py };
  const len = Math.hypot(target.x - ball.x, target.y - ball.y);
  if (len < 1e-3) return null;

  const desiredPullback = 6 * s + bodyH * 0.28 + 3;
  const maxPullback = len * 0.1;
  const targetRadius = Math.min(desiredPullback, maxPullback);

  return {
    from: ball,
    to: serveArcStopBeforeTarget(ball, target, { targetRadius, margin: 2 }),
  };
}

/** Padel 3D — reach the flat landing zone, stop just before receiver (not at the net). */
export function serveArcTraceEndpointsPadel(
  ball: ServeArcPt,
  flatEnd: ServeArcPt,
  slots: ServeArcProjectedSlot[],
  receiverTeam: LiveTeamSide,
  receiverPlayerIndex: number
): { from: ServeArcPt; to: ServeArcPt } | null {
  const receiver = slots.find((s) => s.team === receiverTeam && s.idx === receiverPlayerIndex);
  if (!receiver) return { from: ball, to: flatEnd };

  const s = receiver.avatarScale ?? 1;
  const bodyH = SERVE_COURT_AVATAR_H_PX * s;
  const dx = ball.x - receiver.px;
  const dy = ball.y - receiver.py;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return { from: ball, to: flatEnd };

  const chest = {
    x: receiver.px + (dx / len) * bodyH * 0.42,
    y: receiver.py + (dy / len) * bodyH * 0.42,
  };

  const beforeFlat = serveArcStopBeforeTarget(ball, flatEnd, {
    targetRadius: 8 * s + 8,
    margin: 4,
  });
  const beforeReceiver = serveArcStopBeforeTarget(ball, chest, {
    targetRadius: 10 * s + bodyH * 0.28 + 6,
    margin: 4,
  });

  const distFlat = Math.hypot(beforeFlat.x - ball.x, beforeFlat.y - ball.y);
  const distRecv = Math.hypot(beforeReceiver.x - ball.x, beforeReceiver.y - ball.y);
  const to = distRecv >= distFlat ? beforeReceiver : beforeFlat;

  return { from: ball, to };
}
