import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsRight, Clock, Plus, RotateCw } from 'lucide-react';
import { CourtLobbyPulseRing } from '@/components/playIntent/CourtLobbyPulseRing';
import { CourtLobbySportCourt } from '@/components/playIntent/CourtLobbySportCourt';
import { CourtLobbyThunder } from '@/components/playIntent/CourtLobbyThunder';
import { CourtLobbyMismatchBubbles } from '@/components/playIntent/CourtLobbyMismatchBubbles';
import { CourtLobbyPlayerFitCard } from '@/components/playIntent/CourtLobbyPlayerFitCard';
import { CourtLobbyAvatarImage } from '@/components/playIntent/CourtLobbyAvatarImage';
import type { PoolMember } from '@/api/playIntents';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
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
  /** userId of the far-side player whose fit card is open (freezes that avatar). */
  pinnedUserId?: string | null;
  onAvatarClick: (member: PoolMember) => void | Promise<void>;
  /** Opens the full player profile for the pinned avatar. */
  onOpenProfile?: (userId: string) => void;
  /** Starts (or continues) a 1:1 chat with the pinned player. */
  onStartChat?: (userId: string) => void;
  /** Closes the fit card (called by the card itself). */
  onPinnedChange?: (userId: string | null) => void;
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
  orbitSlot: number;
  handoffElapsed: number | null;
};

type ArenaSize = { width: number; height: number };

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
const AVATAR_BASE_SIZE = 50;
const HANDOFF_SECONDS = 0.65;
const HANDOFF_BLEND_AT_TWENTY_FPS = 0.22;
const DEFAULT_ARENA_SIZE: ArenaSize = { width: 330, height: 330 };

function memberVisual(member: PoolMember, hasProposal: boolean) {
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
  const revolutionSeconds = member.inProposal
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
  const baseRevolutionSeconds = member.inProposal
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

function measureArena(element: HTMLDivElement | null): ArenaSize {
  if (!element) return DEFAULT_ARENA_SIZE;
  const bounds = element.getBoundingClientRect();
  return {
    width: element.clientWidth || bounds.width || DEFAULT_ARENA_SIZE.width,
    height: element.clientHeight || bounds.height || DEFAULT_ARENA_SIZE.height,
  };
}

function positionTransform(x: number, y: number, arena: ArenaSize) {
  return `translate3d(${(x / 100) * arena.width}px, ${(y / 100) * arena.height}px, 0) translate(-50%, -50%)`;
}

function setElementPosition(
  element: HTMLElement | null | undefined,
  x: number,
  y: number,
  arena: ArenaSize,
) {
  if (!element) return;
  if (element.style.left !== '0px') element.style.left = '0px';
  if (element.style.top !== '0px') element.style.top = '0px';
  element.style.transform = positionTransform(x, y, arena);
}

function frameAdjustedBlend(baseAtTwentyFps: number, elapsedSeconds: number) {
  return 1 - Math.pow(1 - baseAtTwentyFps, elapsedSeconds / 0.05);
}

function initials(member: { firstName: string | null; lastName?: string | null }) {
  const a = (member.firstName || '').charAt(0);
  const b = (member.lastName || '').charAt(0);
  return (a + b).toUpperCase() || '?';
}

function fitKey(fit: PoolMember['fit']) {
  if (!fit || fit.length === 0) return '';
  return fit.map((c) => `${c.dimension}:${c.ok ? 1 : 0}:${c.period ?? ''}`).join(',');
}

function membersKey(members: PoolMember[]) {
  return members
    .map(
      (m) =>
        `${m.userId}:${m.status}:${m.inGame ? 1 : 0}:${m.affinity}:${m.inProposal ? 1 : 0}:${m.eligibleForProposal ? 1 : 0}:${m.intentId}:${m.mismatch ? `${m.mismatch.reason}:${m.mismatch.period ?? ''}` : ''}:${fitKey(m.fit)}`,
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
      member.inGame === candidate.inGame &&
      member.affinity === candidate.affinity &&
      !!member.inProposal === !!candidate.inProposal &&
      !!member.eligibleForProposal === !!candidate.eligibleForProposal &&
      member.mismatch?.reason === candidate.mismatch?.reason &&
      member.mismatch?.period === candidate.mismatch?.period &&
      fitKey(member.fit) === fitKey(candidate.fit)
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
    previous.pinnedUserId === next.pinnedUserId &&
    previous.onOpenProfile === next.onOpenProfile &&
    previous.onStartChat === next.onStartChat &&
    previous.onPinnedChange === next.onPinnedChange &&
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
  pinnedUserId,
  onAvatarClick,
  onOpenProfile,
  onStartChat,
  onPinnedChange,
}: Props) {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((s) => s.isFavorite);
  const viewer = useAuthStore((s) => s.user);
  const [shuffleTick, setShuffleTick] = useState(0);
  const [closingCard, setClosingCard] = useState(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const arenaSizeRef = useRef<ArenaSize>(DEFAULT_ARENA_SIZE);
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
  const pinnedUserIdRef = useRef<string | null>(pinnedUserId ?? null);
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
          ((inMatchIndex + 1) / Math.max(partySize, 1)) * Math.PI * 2
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
  }, [hasProposal, members, partySize]);

  const thunderActors = useMemo(
    () =>
      members.map((m) => ({
        id: m.userId,
        affinity: m.eligibleForProposal
          ? ('near' as const)
          : hasProposal && m.affinity === 'near'
            ? ('mid' as const)
            : m.affinity,
        inProposal: !!m.inProposal,
      })),
    [hasProposal, members],
  );
  const mismatchedMembers = useMemo(
    () =>
      members.filter(
        (m) => m.affinity === 'far' && !!m.mismatch && !m.inProposal,
      ),
    [members],
  );
  const viewerAvatar = viewer ? viewer.avatar ?? null : null;
  const viewerInitials = viewer
    ? initials({
        firstName: viewer.firstName ?? null,
        lastName: viewer.lastName ?? null,
      })
    : '';

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
    const matchSlotCount = Math.max(partySize, 1);
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
          (matchSlot / matchSlotCount) * Math.PI * 2
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
        const currentPosition = positionsRef.current.get(node.id);
        if (currentPosition) {
          currentPosition.x = node.x;
          currentPosition.y = node.y;
        } else {
          positionsRef.current.set(node.id, { x: node.x, y: node.y });
        }
        setElementPosition(
          avatarEls.current.get(node.id),
          node.x,
          node.y,
          arenaSizeRef.current,
        );
      }
      const selfMarker = selfMarkerRef.current;
      if (selfMarker && inMatchNodes.length > 0) {
        const selfPosition = polarToXY(
          matchOrbitRef.current.angle,
          ORBIT_IN_MATCH,
        );
        setElementPosition(
          selfMarker,
          selfPosition.x,
          selfPosition.y,
          arenaSizeRef.current,
        );
      }
    }

    setShuffleTick((current) => current + 1);
  };

  useLayoutEffect(() => {
    const n = Math.max(members.length, 1);
    const inMatch = members
      .filter((member) => member.inProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const inMatchSlotById = new Map(
      inMatch.map((member, index) => [member.userId, index + 1]),
    );
    const actionable = members
      .filter((member) => !member.inProposal && member.eligibleForProposal)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const actionableSlotById = new Map(
      actionable.map((member, index) => [member.userId, index]),
    );
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previousNodesById = new Map(
      nodesRef.current.map((node) => [node.id, node]),
    );
    const arenaSize = measureArena(arenaRef.current);
    arenaSizeRef.current = arenaSize;
    const next: DriftNode[] = members.map((member, i) => {
      const inProposal = !!member.inProposal;
      const isActionable = !inProposal && !!member.eligibleForProposal;
      const visual = memberVisual(member, hasProposal);
      const orbitSlot = inProposal
        ? (inMatchSlotById.get(member.userId) ?? 1)
        : isActionable
          ? (actionableSlotById.get(member.userId) ?? 0)
          : i;
      const orbitAngle = inProposal
        ? matchOrbitRef.current.angle +
          (orbitSlot / Math.max(partySize, 1)) * Math.PI * 2
        : isActionable
          ? actionableOrbitRef.current.angle +
            (orbitSlot / actionable.length) * Math.PI * 2
        : (i / n) * Math.PI * 2;
      const orbitRadius = isActionable
        ? actionableOrbitRadius(actionable.length)
        : orbitRadiusFor(member, hasProposal);
      const pos = polarToXY(orbitAngle, orbitRadius);
      const prev = previousNodesById.get(member.userId);
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
        orbitSlot,
        handoffElapsed:
          reduceMotion
            ? null
            : changedProposalState || changedActionableState
              ? 0
              : prev?.handoffElapsed ?? null,
      };
    });
    nodesRef.current = next;
    const map = new Map<string, { x: number; y: number }>();
    for (const node of next) {
      map.set(node.id, { x: node.x, y: node.y });
      setElementPosition(
        avatarEls.current.get(node.id),
        node.x,
        node.y,
        arenaSize,
      );
    }
    positionsRef.current = map;

    const selfMarker = selfMarkerRef.current;
    if (selfMarker) {
      if (inMatch.length > 0) {
        const selfPosition = polarToXY(
          matchOrbitRef.current.angle,
          ORBIT_IN_MATCH,
        );
        setElementPosition(
          selfMarker,
          selfPosition.x,
          selfPosition.y,
          arenaSize,
        );
      } else {
        selfMarker.style.removeProperty('left');
        selfMarker.style.removeProperty('top');
        selfMarker.style.removeProperty('transform');
      }
    }
  }, [hasProposal, key, members, partySize]);

  useLayoutEffect(() => {
    const syncPositionsToArenaSize = () => {
      const arenaSize = measureArena(arenaRef.current);
      arenaSizeRef.current = arenaSize;
      for (const node of nodesRef.current) {
        setElementPosition(
          avatarEls.current.get(node.id),
          node.x,
          node.y,
          arenaSize,
        );
      }

      if (
        selfMarkerRef.current &&
        nodesRef.current.some((node) => node.member.inProposal)
      ) {
        const selfPosition = polarToXY(
          matchOrbitRef.current.angle,
          ORBIT_IN_MATCH,
        );
        setElementPosition(
          selfMarkerRef.current,
          selfPosition.x,
          selfPosition.y,
          arenaSize,
        );
      }
    };

    syncPositionsToArenaSize();
    if (typeof ResizeObserver !== 'undefined' && arenaRef.current) {
      const observer = new ResizeObserver(syncPositionsToArenaSize);
      observer.observe(arenaRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', syncPositionsToArenaSize);
    return () => window.removeEventListener('resize', syncPositionsToArenaSize);
  }, []);

  // Keep the pinned-user id in a ref so the rAF loop reads the latest value
  // without restarting on every pin toggle. A fresh pin also cancels any
  // in-flight exit animation.
  useEffect(() => {
    pinnedUserIdRef.current = pinnedUserId ?? null;
    setClosingCard(false);
  }, [pinnedUserId]);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || members.length === 0) return;

    let last = 0;
    let inMatchCount = 0;
    let actionableCount = 0;
    for (const node of nodesRef.current) {
      if (node.member.inProposal) inMatchCount += 1;
      else if (node.member.eligibleForProposal) actionableCount += 1;
    }
    const matchSlotCount = Math.max(partySize, 1);
    const actionableRadius = actionableOrbitRadius(actionableCount);

    const tick = (ts: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        last = ts;
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      const elapsedSeconds =
        last === 0 ? 1 / 60 : Math.min((ts - last) / 1000, 0.1);
      last = ts;
      if (inMatchCount > 0) {
        matchOrbitRef.current.angle +=
          matchOrbitRef.current.speed * elapsedSeconds;
      }
      if (actionableCount > 0) {
        actionableOrbitRef.current.angle +=
          actionableOrbitRef.current.speed * elapsedSeconds;
      }

      const matchBlend = frameAdjustedBlend(0.065, elapsedSeconds);
      const actionableBlend = frameAdjustedBlend(0.055, elapsedSeconds);
      const freeBlend = frameAdjustedBlend(0.045, elapsedSeconds);
      const handoffBlend = frameAdjustedBlend(
        HANDOFF_BLEND_AT_TWENTY_FPS,
        elapsedSeconds,
      );
      const frameScale = elapsedSeconds / 0.05;
      const randomScale = Math.sqrt(frameScale);
      const nodes = nodesRef.current;
      for (const node of nodes) {
        let { x, y, vx, vy, orbitAngle } = node;
        const inHandoff = node.handoffElapsed !== null;
        const inProposal = !!node.member.inProposal;
        // Frozen while its fit card is open — keep position & zero velocity.
        if (pinnedUserIdRef.current === node.id) {
          vx = 0;
          vy = 0;
          node.x = x;
          node.y = y;
          node.vx = 0;
          node.vy = 0;
          node.orbitAngle = orbitAngle;
          continue;
        }
        if (inProposal) {
          orbitAngle =
            matchOrbitRef.current.angle +
            (node.orbitSlot / matchSlotCount) * Math.PI * 2;
          const target = polarToXY(orbitAngle, ORBIT_IN_MATCH);
          const blend = inHandoff ? handoffBlend : matchBlend;
          x += (target.x - x) * blend;
          y += (target.y - y) * blend;
          vx = 0;
          vy = 0;
          node.orbitRadius = ORBIT_IN_MATCH;
        } else if (node.member.eligibleForProposal) {
          orbitAngle =
            actionableOrbitRef.current.angle +
            (node.orbitSlot / actionableCount) * Math.PI * 2;
          const target = polarToXY(orbitAngle, actionableRadius);
          const blend = inHandoff ? handoffBlend : actionableBlend;
          x += (target.x - x) * blend;
          y += (target.y - y) * blend;
          vx = 0;
          vy = 0;
          node.orbitRadius = actionableRadius;
        } else {
          const targetR = Math.max(node.orbitRadius, CENTER_CLEARANCE);
          const target = polarToXY(orbitAngle, targetR);

          const blend = inHandoff ? handoffBlend : freeBlend;
          x += (target.x - x) * blend;
          y += (target.y - y) * blend;
          orbitAngle += node.orbitSpeed * elapsedSeconds;
          vx += (Math.random() - 0.5) * 0.005 * randomScale;
          vy += (Math.random() - 0.5) * 0.005 * randomScale;
          vx = Math.max(-0.065, Math.min(0.065, vx));
          vy = Math.max(-0.065, Math.min(0.065, vy));
          x += vx * 0.28 * frameScale;
          y += vy * 0.28 * frameScale;

          const clamped = pushOutsideCenter(x, y, CENTER_CLEARANCE);
          x = Math.max(7, Math.min(93, clamped.x));
          y = Math.max(20, Math.min(89, clamped.y));
          node.orbitRadius = targetR;
        }

        node.x = x;
        node.y = y;
        node.vx = vx;
        node.vy = vy;
        node.orbitAngle = orbitAngle;
        if (node.handoffElapsed !== null) {
          node.handoffElapsed += elapsedSeconds;
          if (node.handoffElapsed >= HANDOFF_SECONDS) {
            node.handoffElapsed = null;
          }
        }
      }

      const map = positionsRef.current;
      const arenaSize = arenaSizeRef.current;
      for (const node of nodes) {
        const currentPosition = map.get(node.id);
        if (currentPosition) {
          currentPosition.x = node.x;
          currentPosition.y = node.y;
        } else {
          map.set(node.id, { x: node.x, y: node.y });
        }
        setElementPosition(
          avatarEls.current.get(node.id),
          node.x,
          node.y,
          arenaSize,
        );
      }

      const selfMarker = selfMarkerRef.current;
      if (selfMarker) {
        if (inMatchCount > 0) {
          const selfPosition = polarToXY(
            matchOrbitRef.current.angle,
            ORBIT_IN_MATCH,
          );
          setElementPosition(
            selfMarker,
            selfPosition.x,
            selfPosition.y,
            arenaSize,
          );
        } else {
          selfMarker.style.removeProperty('left');
          selfMarker.style.removeProperty('top');
          selfMarker.style.removeProperty('transform');
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [key, members.length, partySize]);

  return (
    <div
      ref={arenaRef}
      className="court-lobby-arena relative h-[330px] overflow-hidden rounded-[28px]"
    >
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
            <CourtLobbyAvatarImage
              avatar={viewerAvatar}
              initials={viewerInitials}
              imgClassName="h-full w-full object-cover"
            />
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
      {!busy && mismatchedMembers.length > 0 && (
        <CourtLobbyMismatchBubbles
          positionsRef={positionsRef}
          arenaSizeRef={arenaSizeRef}
          members={mismatchedMembers}
        />
      )}
      {layout.map((node) => {
        const favorite = isFavorite(node.member.userId);
        const inProposal = !!node.member.inProposal;
        const avatarScale = node.size / AVATAR_BASE_SIZE;
        const inverseAvatarScale = 1 / avatarScale;
        // `frozen` covers the whole pin lifecycle (open + exit) so the avatar
        // stays positionally locked and on top while the card animates. `pinned`
        // is the visual enlargement/glow — it lifts on open and releases the
        // instant the exit begins, so the avatar shrinks in sync with the card
        // instead of pausing at full size and shrinking afterwards.
        const frozen = pinnedUserId === node.id;
        const pinned = frozen && !closingCard;
        const highlightedForReAdd =
          vacancy > 0 &&
          !rosterLocked &&
          !inProposal &&
          !!node.member.eligibleForProposal;
        const displayName =
          [node.member.firstName, node.member.lastName].filter(Boolean).join(' ') ||
          t('common.player', { defaultValue: 'Player' });
        // The affinity label reflects how good a fit the player is. A separate
        // "in another game" badge (rendered below) carries that context without
        // overriding the fit signal.
        const affinityLabel = highlightedForReAdd
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
            data-in-game={node.member.inGame ? 'true' : 'false'}
            data-favorite={favorite ? 'true' : 'false'}
            data-readd={highlightedForReAdd ? 'true' : 'false'}
            data-actionable={highlightedForReAdd ? 'true' : 'false'}
            data-pinned={frozen ? 'true' : 'false'}
            data-pinned-active={pinned ? 'true' : 'false'}
            ref={(el) => {
              if (el) avatarEls.current.set(node.id, el);
              else avatarEls.current.delete(node.id);
            }}
            className="court-lobby-arena__avatar absolute"
            style={{
              left: '0px',
              top: '0px',
              transform: positionTransform(
                node.x,
                node.y,
                arenaSizeRef.current,
              ),
              width: node.size,
              height: node.size,
              opacity: node.opacity,
            }}
            onClick={() => {
              // Tapping the already-pinned avatar toggles the card closed via
              // the exit animation (rather than a hard unmount from the parent).
              if (pinnedUserId === node.id) {
                setClosingCard(true);
                return;
              }
              void onAvatarClick(node.member);
            }}
          >
            <span
              className="court-lobby-arena__avatar-visual"
              style={{
                transform: `translate(-50%, -50%) scale(${
                  pinned ? avatarScale * 1.5 : avatarScale
                })`,
              }}
            >
              <span className="court-lobby-arena__avatar-halo" aria-hidden />
              <span className="court-lobby-arena__avatar-image">
                <CourtLobbyAvatarImage
                  avatar={node.member.avatar}
                  initials={initials(node.member)}
                  imgClassName="h-full w-full object-cover"
                  initialsClassName="court-lobby-arena__avatar-initials"
                  initialsStyle={{ scale: `${inverseAvatarScale}` }}
                />
              </span>
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
            {node.member.inGame && !inProposal && (
              <span
                className="court-lobby-arena__avatar-in-game"
                aria-label={t('playIntent.inGame', {
                  defaultValue: 'In another game',
                })}
              >
                <Clock size={9} strokeWidth={3} />
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
      {(pinnedUserId || closingCard) &&
        (() => {
          const activeId = pinnedUserId;
          if (!activeId) return null;
          const pinnedMember = members.find((m) => m.userId === activeId);
          if (!pinnedMember) return null;
          const anchorEl = avatarEls.current.get(activeId) ?? null;
          return (
            <CourtLobbyPlayerFitCard
              member={pinnedMember}
              anchorEl={anchorEl}
              closing={closingCard}
              onExited={() => {
                setClosingCard(false);
                onPinnedChange?.(null);
              }}
              onClose={() => setClosingCard(true)}
              onOpenProfile={(id) => onOpenProfile?.(id)}
              onStartChat={onStartChat ? (id) => onStartChat(id) : undefined}
            />
          );
        })()}
    </div>
  );
}

export const CourtLobbyArena = memo(
  CourtLobbyArenaComponent,
  arenaPropsEqual,
);
CourtLobbyArena.displayName = 'CourtLobbyArena';
