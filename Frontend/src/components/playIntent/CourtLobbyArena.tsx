import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsRight, Plus, RotateCw } from 'lucide-react';
import { CourtLobbyPulseRing } from '@/components/playIntent/CourtLobbyPulseRing';
import { CourtLobbySportCourt } from '@/components/playIntent/CourtLobbySportCourt';
import { CourtLobbyThunder } from '@/components/playIntent/CourtLobbyThunder';
import type { PoolMember } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';
import type { Sport } from '@/types';
import './CourtLobbyArena.css';

type Props = {
  members: PoolMember[];
  overflow: number;
  busy: boolean;
  hasProposal: boolean;
  vacancy: number;
  rosterLocked: boolean;
  sport: Sport;
  partySize: number;
  onAvatarClick: (member: PoolMember) => void | Promise<void>;
};

type DriftNode = {
  id: string;
  member: PoolMember;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
};

const COURT_CX = 50;
const COURT_CY = 54;
const CENTER_CLEARANCE = 18;
const ORBIT_IN_MATCH = 8;
const ORBIT_NEAR = 29;
const ORBIT_MID = 41;
const ORBIT_FAR = 53;
const MATCH_ORBIT_START_ANGLE = -0.32;
const MATCH_ORBIT_SECONDS = 190;
const ACTIONABLE_ORBIT_START_ANGLE = Math.PI * 0.82;
const ACTIONABLE_ORBIT_SECONDS = 225;

function memberVisual(member: PoolMember, hasProposal: boolean) {
  if (member.busyInGame) return { size: 31, opacity: 0.38 };
  if (member.inProposal) return { size: 30, opacity: 1 };
  if (
    member.eligibleForProposal ||
    (!hasProposal && member.affinity === 'near')
  ) {
    return { size: 50, opacity: 1 };
  }
  if (member.affinity === 'near' || member.affinity === 'mid') {
    return { size: 40, opacity: 0.82 };
  }
  return { size: 31, opacity: 0.5 };
}

function orbitRadiusFor(member: PoolMember, hasProposal: boolean): number {
  if (member.busyInGame) return ORBIT_FAR;
  if (member.inProposal) return ORBIT_IN_MATCH;
  if (member.eligibleForProposal) return ORBIT_NEAR;
  if (hasProposal && member.affinity === 'near') return ORBIT_MID;
  if (member.affinity === 'near') return ORBIT_NEAR;
  if (member.affinity === 'mid') return ORBIT_MID;
  return ORBIT_FAR;
}

function actionableOrbitRadius(count: number): number {
  return Math.min(35, ORBIT_NEAR + Math.max(0, count - 6) * 0.7);
}

function stableUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function orbitSpeedFor(member: PoolMember): number {
  const revolutionSeconds = member.busyInGame
    ? 360
    : member.inProposal
      ? 210
      : member.eligibleForProposal || member.affinity === 'near'
        ? 195
        : member.affinity === 'mid'
          ? 255
          : 330;
  const stableVariation = 0.82 + stableUnitInterval(`${member.userId}:speed`) * 0.4;
  const direction = stableUnitInterval(`${member.userId}:direction`) < 0.28 ? -1 : 1;
  return direction * ((Math.PI * 2) / (revolutionSeconds * stableVariation));
}

function randomizedOrbitSpeedFor(member: PoolMember): number {
  const baseRevolutionSeconds = member.busyInGame
    ? 360
    : member.inProposal
      ? 210
      : member.eligibleForProposal || member.affinity === 'near'
        ? 195
        : member.affinity === 'mid'
          ? 255
          : 330;
  const speedVariation = 0.72 + Math.random() * 0.62;
  const direction = Math.random() < 0.5 ? -1 : 1;
  return direction * ((Math.PI * 2) / (baseRevolutionSeconds * speedVariation));
}

function polarToXY(angle: number, radius: number) {
  return {
    x: COURT_CX + Math.cos(angle) * radius,
    y: COURT_CY + Math.sin(angle) * (radius * 0.74),
  };
}

function pushOutsideCenter(x: number, y: number, minR: number) {
  const dx = x - COURT_CX;
  const dy = (y - COURT_CY) / 0.74;
  const r = Math.hypot(dx, dy);
  if (r >= minR || r < 0.001) return { x, y };
  const scale = minR / r;
  return {
    x: COURT_CX + dx * scale,
    y: COURT_CY + dy * scale * 0.74,
  };
}

function initials(member: { firstName: string | null; lastName?: string | null }) {
  const a = (member.firstName || '').charAt(0);
  const b = (member.lastName || '').charAt(0);
  return (a + b).toUpperCase() || '?';
}

function membersKey(members: PoolMember[]) {
  return members
    .map(
      (m) =>
        `${m.userId}:${m.status}:${m.busyInGame ? 1 : 0}:${m.affinity}:${m.inProposal ? 1 : 0}:${m.eligibleForProposal ? 1 : 0}:${m.intentId}`,
    )
    .join('|');
}

function arenaMembersEqual(previous: PoolMember[], next: PoolMember[]) {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every((member, index) => {
    const candidate = next[index];
    return (
      member.userId === candidate.userId &&
      member.intentId === candidate.intentId &&
      member.firstName === candidate.firstName &&
      member.lastName === candidate.lastName &&
      member.avatar === candidate.avatar &&
      member.status === candidate.status &&
      member.busyInGame === candidate.busyInGame &&
      member.affinity === candidate.affinity &&
      !!member.inProposal === !!candidate.inProposal &&
      !!member.eligibleForProposal === !!candidate.eligibleForProposal
    );
  });
}

function arenaPropsEqual(previous: Props, next: Props) {
  return (
    previous.overflow === next.overflow &&
    previous.busy === next.busy &&
    previous.hasProposal === next.hasProposal &&
    previous.vacancy === next.vacancy &&
    previous.rosterLocked === next.rosterLocked &&
    previous.sport === next.sport &&
    previous.partySize === next.partySize &&
    previous.onAvatarClick === next.onAvatarClick &&
    arenaMembersEqual(previous.members, next.members)
  );
}

/** Animated court — drift/thunder are imperative (no React setState per frame). */
function CourtLobbyArenaComponent({
  members,
  overflow,
  busy,
  hasProposal,
  vacancy,
  rosterLocked,
  sport,
  partySize,
  onAvatarClick,
}: Props) {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((s) => s.isFavorite);
  const viewer = useAuthStore((s) => s.user);
  const [shuffleTick, setShuffleTick] = useState(0);
  const nodesRef = useRef<DriftNode[]>([]);
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const avatarEls = useRef(new Map<string, HTMLButtonElement>());
  const selfMarkerRef = useRef<HTMLDivElement | null>(null);
  const matchOrbitRef = useRef({
    angle: MATCH_ORBIT_START_ANGLE,
    speed: (Math.PI * 2) / MATCH_ORBIT_SECONDS,
  });
  const actionableOrbitRef = useRef({
    angle: ACTIONABLE_ORBIT_START_ANGLE,
    speed: -(Math.PI * 2) / ACTIONABLE_ORBIT_SECONDS,
  });
  const frameRef = useRef<number | null>(null);
  const key = membersKey(members);
  const inMatchCount = members.filter((member) => member.inProposal).length;

  const layout = useMemo(() => {
    const n = Math.max(members.length, 1);
    const inMatch = members
      .filter((member) => member.inProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const actionable = members
      .filter((member) => !member.inProposal && member.eligibleForProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    return members.map((member, i) => {
      const inProposal = !!member.inProposal;
      const isActionable = !inProposal && !!member.eligibleForProposal;
      const visual = memberVisual(member, hasProposal);
      const inMatchIndex = inProposal
        ? inMatch.findIndex((candidate) => candidate.userId === member.userId)
        : -1;
      const actionableIndex = isActionable
        ? actionable.findIndex(
            (candidate) => candidate.userId === member.userId,
          )
        : -1;
      const orbitAngle = inProposal
        ? matchOrbitRef.current.angle +
          ((inMatchIndex + 1) / (inMatch.length + 1)) * Math.PI * 2
        : isActionable
          ? actionableOrbitRef.current.angle +
            (actionableIndex / actionable.length) * Math.PI * 2
        : (i / n) * Math.PI * 2;
      const orbitRadius = isActionable
        ? actionableOrbitRadius(actionable.length)
        : orbitRadiusFor(member, hasProposal);
      const pos = polarToXY(orbitAngle, orbitRadius);
      return {
        id: member.userId,
        member,
        x: pos.x,
        y: pos.y,
        size: visual.size,
        opacity: visual.opacity,
        orbitAngle,
        orbitRadius,
      };
    });
  }, [hasProposal, members]);

  const thunderActors = useMemo(
    () =>
      members.map((m) => ({
        id: m.userId,
        affinity: m.busyInGame
          ? ('far' as const)
          : m.eligibleForProposal
            ? ('near' as const)
            : hasProposal && m.affinity === 'near'
              ? ('mid' as const)
              : m.affinity,
        inProposal: !!m.inProposal,
      })),
    [hasProposal, members],
  );
  const viewerAvatar = viewer
    ? userAvatarTinyUrlFromStandard(viewer.avatar) ?? viewer.avatar ?? null
    : null;

  const shufflePlayers = () => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    matchOrbitRef.current = {
      angle: Math.random() * Math.PI * 2,
      speed:
        (Math.random() < 0.5 ? -1 : 1) *
        ((Math.PI * 2) / (150 + Math.random() * 110)),
    };
    actionableOrbitRef.current = {
      angle: Math.random() * Math.PI * 2,
      speed:
        (Math.random() < 0.5 ? -1 : 1) *
        ((Math.PI * 2) / (180 + Math.random() * 130)),
    };

    const inMatchNodes = nodesRef.current
      .filter((node) => node.member.inProposal)
      .sort((a, b) => a.id.localeCompare(b.id));
    const matchSlotById = new Map(
      inMatchNodes.map((node, index) => [node.id, index + 1]),
    );
    const centralRosterSize = inMatchNodes.length + 1;
    const actionableNodes = nodesRef.current
      .filter(
        (node) =>
          !node.member.inProposal && node.member.eligibleForProposal,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const actionableSlotById = new Map(
      actionableNodes.map((node, index) => [node.id, index]),
    );
    const actionableRadius = actionableOrbitRadius(actionableNodes.length);
    const next = nodesRef.current.map((node) => {
      const orbitAngle = Math.random() * Math.PI * 2;
      const velocityAngle = Math.random() * Math.PI * 2;
      const velocityMagnitude = 0.025 + Math.random() * 0.04;
      const matchSlot = matchSlotById.get(node.id) ?? 1;
      const actionableSlot = actionableSlotById.get(node.id) ?? 0;
      const isActionable =
        !node.member.inProposal && !!node.member.eligibleForProposal;
      const targetAngle = node.member.inProposal
        ? matchOrbitRef.current.angle +
          (matchSlot / centralRosterSize) * Math.PI * 2
        : isActionable
          ? actionableOrbitRef.current.angle +
            (actionableSlot / Math.max(actionableNodes.length, 1)) *
              Math.PI *
              2
          : orbitAngle;
      const target = polarToXY(
        targetAngle,
        isActionable ? actionableRadius : node.orbitRadius,
      );
      return {
        ...node,
        x: reduceMotion ? target.x : node.x,
        y: reduceMotion ? target.y : node.y,
        vx: node.member.inProposal || isActionable
          ? 0
          : Math.cos(velocityAngle) * velocityMagnitude,
        vy: node.member.inProposal || isActionable
          ? 0
          : Math.sin(velocityAngle) * velocityMagnitude,
        orbitAngle,
        orbitSpeed: randomizedOrbitSpeedFor(node.member),
      };
    });
    nodesRef.current = next;

    if (reduceMotion) {
      for (const node of next) {
        positionsRef.current.set(node.id, { x: node.x, y: node.y });
        const el = avatarEls.current.get(node.id);
        if (el) {
          el.style.left = `${node.x}%`;
          el.style.top = `${node.y}%`;
        }
      }
      const selfMarker = selfMarkerRef.current;
      if (selfMarker && inMatchNodes.length > 0) {
        const selfPosition = polarToXY(
          matchOrbitRef.current.angle,
          ORBIT_IN_MATCH,
        );
        selfMarker.style.left = `${selfPosition.x}%`;
        selfMarker.style.top = `${selfPosition.y}%`;
      }
    }

    setShuffleTick((current) => current + 1);
  };

  useLayoutEffect(() => {
    const n = Math.max(members.length, 1);
    const inMatch = members
      .filter((member) => member.inProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const actionable = members
      .filter((member) => !member.inProposal && member.eligibleForProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next: DriftNode[] = members.map((member, i) => {
      const inProposal = !!member.inProposal;
      const isActionable = !inProposal && !!member.eligibleForProposal;
      const visual = memberVisual(member, hasProposal);
      const inMatchIndex = inProposal
        ? inMatch.findIndex((candidate) => candidate.userId === member.userId)
        : -1;
      const actionableIndex = isActionable
        ? actionable.findIndex(
            (candidate) => candidate.userId === member.userId,
          )
        : -1;
      const orbitAngle = inProposal
        ? matchOrbitRef.current.angle +
          ((inMatchIndex + 1) / (inMatch.length + 1)) * Math.PI * 2
        : isActionable
          ? actionableOrbitRef.current.angle +
            (actionableIndex / actionable.length) * Math.PI * 2
        : (i / n) * Math.PI * 2;
      const orbitRadius = isActionable
        ? actionableOrbitRadius(actionable.length)
        : orbitRadiusFor(member, hasProposal);
      const pos = polarToXY(orbitAngle, orbitRadius);
      const prev = nodesRef.current.find((node) => node.id === member.userId);
      const changedProposalState =
        !!prev && !!prev.member.inProposal !== inProposal;
      const changedActionableState =
        !!prev &&
        !!prev.member.eligibleForProposal !==
          !!member.eligibleForProposal;
      return {
        id: member.userId,
        member,
        x: reduceMotion ? pos.x : prev?.x ?? pos.x,
        y: reduceMotion ? pos.y : prev?.y ?? pos.y,
        vx: prev?.vx ?? (Math.random() - 0.5) * 0.06,
        vy: prev?.vy ?? (Math.random() - 0.5) * 0.06,
        size: visual.size,
        opacity: visual.opacity,
        orbitAngle:
          changedProposalState || changedActionableState || reduceMotion
            ? orbitAngle
            : prev?.orbitAngle ?? orbitAngle,
        orbitRadius,
        orbitSpeed: orbitSpeedFor(member),
      };
    });
    nodesRef.current = next;
    const map = new Map<string, { x: number; y: number }>();
    for (const node of next) {
      map.set(node.id, { x: node.x, y: node.y });
      const el = avatarEls.current.get(node.id);
      if (el) {
        el.style.left = `${node.x}%`;
        el.style.top = `${node.y}%`;
      }
    }
    positionsRef.current = map;

    const selfMarker = selfMarkerRef.current;
    if (selfMarker) {
      if (inMatch.length > 0) {
        const selfPosition = polarToXY(
          matchOrbitRef.current.angle,
          ORBIT_IN_MATCH,
        );
        selfMarker.style.left = `${selfPosition.x}%`;
        selfMarker.style.top = `${selfPosition.y}%`;
      } else {
        selfMarker.style.removeProperty('left');
        selfMarker.style.removeProperty('top');
      }
    }
  }, [hasProposal, key, members]);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || members.length === 0) return;

    let last = 0;
    const tick = (ts: number) => {
      if (ts - last < 50) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsedSeconds = last === 0 ? 0.05 : Math.min((ts - last) / 1000, 0.1);
      last = ts;
      if (typeof document !== 'undefined' && document.hidden) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      const inMatchNodes = nodesRef.current
        .filter((node) => node.member.inProposal)
        .sort((a, b) => a.id.localeCompare(b.id));
      const matchSlotById = new Map(
        inMatchNodes.map((node, index) => [node.id, index + 1]),
      );
      const centralRosterSize = inMatchNodes.length + 1;
      const actionableNodes = nodesRef.current
        .filter(
          (node) =>
            !node.member.inProposal && node.member.eligibleForProposal,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const actionableSlotById = new Map(
        actionableNodes.map((node, index) => [node.id, index]),
      );
      const actionableRadius = actionableOrbitRadius(actionableNodes.length);
      if (inMatchNodes.length > 0) {
        matchOrbitRef.current.angle +=
          matchOrbitRef.current.speed * elapsedSeconds;
      }
      if (actionableNodes.length > 0) {
        actionableOrbitRef.current.angle +=
          actionableOrbitRef.current.speed * elapsedSeconds;
      }

      const updated = nodesRef.current.map((node) => {
        let { x, y, vx, vy, orbitAngle } = node;
        const inProposal = !!node.member.inProposal;
        if (inProposal) {
          const slot = matchSlotById.get(node.id) ?? 1;
          orbitAngle =
            matchOrbitRef.current.angle +
            (slot / centralRosterSize) * Math.PI * 2;
          const target = polarToXY(orbitAngle, ORBIT_IN_MATCH);
          x += (target.x - x) * 0.065;
          y += (target.y - y) * 0.065;
          return {
            ...node,
            x,
            y,
            vx: 0,
            vy: 0,
            orbitAngle,
            orbitRadius: ORBIT_IN_MATCH,
          };
        }

        const isActionable = !!node.member.eligibleForProposal;
        if (isActionable) {
          const slot = actionableSlotById.get(node.id) ?? 0;
          orbitAngle =
            actionableOrbitRef.current.angle +
            (slot / actionableNodes.length) * Math.PI * 2;
          const target = polarToXY(orbitAngle, actionableRadius);
          x += (target.x - x) * 0.055;
          y += (target.y - y) * 0.055;
          return {
            ...node,
            x,
            y,
            vx: 0,
            vy: 0,
            orbitAngle,
            orbitRadius: actionableRadius,
          };
        }

        const targetR = Math.max(node.orbitRadius, CENTER_CLEARANCE);
        const target = polarToXY(orbitAngle, targetR);

        x += (target.x - x) * 0.045;
        y += (target.y - y) * 0.045;
        orbitAngle += node.orbitSpeed * elapsedSeconds;
        vx += (Math.random() - 0.5) * 0.005;
        vy += (Math.random() - 0.5) * 0.005;
        vx = Math.max(-0.065, Math.min(0.065, vx));
        vy = Math.max(-0.065, Math.min(0.065, vy));
        x += vx * 0.28;
        y += vy * 0.28;

        const clamped = inProposal
          ? { x, y }
          : pushOutsideCenter(x, y, CENTER_CLEARANCE);
        x = Math.max(7, Math.min(93, clamped.x));
        y = Math.max(20, Math.min(89, clamped.y));

        return { ...node, x, y, vx, vy, orbitAngle, orbitRadius: targetR };
      });

      nodesRef.current = updated;
      const map = positionsRef.current;
      for (const node of updated) {
        map.set(node.id, { x: node.x, y: node.y });
        const el = avatarEls.current.get(node.id);
        if (el) {
          el.style.left = `${node.x}%`;
          el.style.top = `${node.y}%`;
        }
      }

      const selfMarker = selfMarkerRef.current;
      if (selfMarker) {
        if (inMatchNodes.length > 0) {
          const selfPosition = polarToXY(
            matchOrbitRef.current.angle,
            ORBIT_IN_MATCH,
          );
          selfMarker.style.left = `${selfPosition.x}%`;
          selfMarker.style.top = `${selfPosition.y}%`;
        } else {
          selfMarker.style.removeProperty('left');
          selfMarker.style.removeProperty('top');
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [key, members.length]);

  return (
    <div className="court-lobby-arena relative h-[330px] overflow-hidden rounded-[28px]">
      <div className="court-lobby-arena__aurora" aria-hidden />
      <div className="court-lobby-arena__grid" aria-hidden />
      <div className="court-lobby-arena__scan" aria-hidden />

      <div className="court-lobby-arena__guide" aria-hidden>
        <span className="court-lobby-arena__guide-edge" />
        <span className="court-lobby-arena__guide-track">
          <i />
          <i />
          <i />
        </span>
        <ChevronsRight size={13} strokeWidth={2.4} />
        <span className="court-lobby-arena__guide-core" />
      </div>
      <button
        type="button"
        className="court-lobby-arena__shuffle"
        aria-label={t('playIntent.refreshArena', {
          defaultValue: 'Shuffle player positions',
        })}
        title={t('playIntent.refreshArena', {
          defaultValue: 'Shuffle player positions',
        })}
        disabled={members.length === 0}
        onClick={shufflePlayers}
      >
        <RotateCw
          key={shuffleTick}
          size={14}
          strokeWidth={2.4}
          className={shuffleTick > 0 ? 'is-shuffling' : undefined}
          aria-hidden
        />
      </button>
      <p className="court-lobby-arena__hint">
        {t('playIntent.proximityHint', {
          defaultValue: 'Closer to center · closer to a game',
        })}
      </p>

      <div className="court-lobby-arena__zone court-lobby-arena__zone--far" aria-hidden />
      <div className="court-lobby-arena__zone court-lobby-arena__zone--mid" aria-hidden />
      <div className="court-lobby-arena__zone court-lobby-arena__zone--near" aria-hidden />

      <CourtLobbyPulseRing />

      <div
        className={`court-lobby-arena__game-core ${hasProposal ? 'is-ready' : ''}`}
        data-sport={sport}
      >
        <span className="court-lobby-arena__court" aria-hidden>
          <CourtLobbySportCourt sport={sport} matchDoubles={partySize > 2} />
        </span>
        <span className="court-lobby-arena__core-label">
          {hasProposal
            ? t('playIntent.matchCenter', { defaultValue: 'Match ready' })
            : t('playIntent.gameCenter', { defaultValue: 'Game' })}
        </span>
      </div>

      {viewer && (
        <div
          ref={selfMarkerRef}
          className="court-lobby-arena__self-marker"
          data-orbiting={inMatchCount > 0 ? 'true' : 'false'}
          aria-label={t('playIntent.youAreHere', { defaultValue: 'You are here' })}
        >
          <span className="court-lobby-arena__self-avatar" aria-hidden>
            {viewerAvatar ? (
              <img src={viewerAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              initials({
                firstName: viewer.firstName ?? null,
                lastName: viewer.lastName ?? null,
              })
            )}
          </span>
        </div>
      )}

      <CourtLobbyThunder
        actors={thunderActors}
        positionsRef={positionsRef}
        active
        cy={COURT_CY}
        ringRadius={10}
      />
      {layout.map((node) => {
        const favorite = isFavorite(node.member.userId);
        const inProposal = !!node.member.inProposal;
        const highlightedForReAdd =
          !inProposal && !!node.member.eligibleForProposal;
        const src = node.member.avatar
          ? userAvatarTinyUrlFromStandard(node.member.avatar)
          : null;
        const displayName =
          [node.member.firstName, node.member.lastName].filter(Boolean).join(' ') ||
          t('common.player', { defaultValue: 'Player' });
        const affinityLabel = node.member.busyInGame
          ? t('playIntent.busyInGame', { defaultValue: 'Already in a game' })
          : highlightedForReAdd
            ? t('playIntent.addBackToMatch', {
                defaultValue: 'Add back to match',
              })
            : inProposal
              ? t('playIntent.affinityInMatch', {
                  defaultValue: 'In the match',
                })
              : t(
                  `playIntent.affinity${node.member.affinity[0].toUpperCase()}${node.member.affinity.slice(1)}`,
                  {
                    defaultValue:
                      node.member.affinity === 'near'
                        ? 'Great fit'
                        : node.member.affinity === 'mid'
                          ? 'Possible fit'
                          : 'Exploring',
                  },
                );

        return (
          <button
            key={node.id}
            type="button"
            disabled={busy}
            aria-label={`${displayName} · ${affinityLabel}`}
            title={`${displayName} · ${affinityLabel}`}
            data-affinity={node.member.affinity}
            data-in-proposal={inProposal ? 'true' : 'false'}
            data-busy-in-game={node.member.busyInGame ? 'true' : 'false'}
            data-favorite={favorite ? 'true' : 'false'}
            data-readd={highlightedForReAdd ? 'true' : 'false'}
            data-actionable={highlightedForReAdd ? 'true' : 'false'}
            ref={(el) => {
              if (el) avatarEls.current.set(node.id, el);
              else avatarEls.current.delete(node.id);
            }}
            className="court-lobby-arena__avatar absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size,
              height: node.size,
              opacity: node.opacity,
            }}
            onClick={() => void onAvatarClick(node.member)}
          >
            <span className="court-lobby-arena__avatar-halo" aria-hidden />
            <span className="court-lobby-arena__avatar-image">
              {src ? (
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(node.member)
              )}
            </span>
            {inProposal && (
              <span className="court-lobby-arena__avatar-check" aria-hidden>
                <Check size={9} strokeWidth={3} />
              </span>
            )}
            {highlightedForReAdd && (
              <span className="court-lobby-arena__avatar-readd" aria-hidden>
                <Plus size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
      {overflow > 0 && (
        <div className="court-lobby-arena__chip absolute bottom-3 right-3">
          {t('playIntent.overflow', { count: overflow })}
        </div>
      )}
      {hasProposal && vacancy > 0 && !rosterLocked && (
        <div className="court-lobby-arena__chip court-lobby-arena__chip--action absolute bottom-3 left-3">
          {t('playIntent.tapToAdd', { count: vacancy })}
        </div>
      )}
    </div>
  );
}

export const CourtLobbyArena = memo(
  CourtLobbyArenaComponent,
  arenaPropsEqual,
);
CourtLobbyArena.displayName = 'CourtLobbyArena';
