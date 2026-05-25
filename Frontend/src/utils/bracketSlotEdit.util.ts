import type { BracketSlotDto, PatchBracketSlotsRequest } from '@/api/leagues';
import type { Game } from '@/types';
import { isFullGame } from '@/utils/leagueBracketEnrich';
import { participantDisplayName } from '@/utils/leagueBracketLayout';

export type BracketEditSide = 'A' | 'B';

export type BracketEditPosition = {
  key: string;
  slotId: string;
  slotKind: BracketSlotDto['slotKind'];
  roundIndex: number;
  roundLabel?: string | null;
  side?: BracketEditSide;
  seed?: number | null;
  participantId: string | null;
  participant: BracketSlotDto['participant'] | null;
  locked: boolean;
};

type SlotRow = {
  slotKind: BracketSlotDto['slotKind'];
  roundIndex: number;
  game?: BracketSlotDto['game'];
};

function slotRow(s: BracketSlotDto): SlotRow {
  return { slotKind: s.slotKind, roundIndex: s.roundIndex, game: s.game };
}

export function playInPhaseHasFinal(slots: SlotRow[]): boolean {
  return slots.some(
    (s) => s.slotKind === 'PLAY_IN' && s.game && 'resultsStatus' in s.game && s.game.resultsStatus === 'FINAL'
  );
}

export function mainRoundHasFinal(slots: SlotRow[], roundIndex: number): boolean {
  return slots.some(
    (s) =>
      s.slotKind === 'MAIN' &&
      s.roundIndex === roundIndex &&
      s.game &&
      'resultsStatus' in s.game &&
      s.game.resultsStatus === 'FINAL'
  );
}

function gameIsFinal(game: BracketSlotDto['game']): boolean {
  return !!game && 'resultsStatus' in game && game.resultsStatus === 'FINAL';
}

function participantPool(slots: BracketSlotDto[]): Map<string, NonNullable<BracketSlotDto['participant']>> {
  const pool = new Map<string, NonNullable<BracketSlotDto['participant']>>();
  for (const s of slots) {
    const p = s.participant;
    if (!p?.id) continue;
    pool.set(p.id, p);
    if (s.leagueParticipantId) pool.set(s.leagueParticipantId, p);
  }
  return pool;
}

function participantIdForGameSide(
  game: Game,
  side: BracketEditSide,
  pool: Map<string, NonNullable<BracketSlotDto['participant']>>
): string | null {
  const teamNumber = side === 'A' ? 1 : 2;
  const team = game.fixedTeams?.find((t) => t.teamNumber === teamNumber);
  if (!team?.players?.length) return null;
  const userIds = new Set(team.players.map((p) => p.userId));
  for (const [id, p] of pool) {
    const roster = p.leagueTeam?.players?.map((pl) => pl.userId) ?? [];
    if (roster.length > 0 && roster.every((uid) => userIds.has(uid))) return id;
  }
  return null;
}

export function bracketEditPositionLabel(pos: BracketEditPosition): string {
  const name = participantDisplayName(pos.participant) || '—';
  if (pos.slotKind === 'BYE') return name;
  const round = pos.roundLabel ?? `R${pos.roundIndex + 1}`;
  if (pos.side) return `${round} · ${pos.side}: ${name}`;
  return `${round}: ${name}`;
}

export function buildBracketEditPositions(slots: BracketSlotDto[]): BracketEditPosition[] {
  const rows = slots.map(slotRow);
  const playInLocked = playInPhaseHasFinal(rows);
  const pool = participantPool(slots);
  const out: BracketEditPosition[] = [];

  for (const slot of slots) {
    const locked =
      slot.slotKind === 'BYE' || slot.slotKind === 'PLAY_IN'
        ? playInLocked
        : mainRoundHasFinal(rows, slot.roundIndex);

    if (slot.slotKind === 'BYE') {
      const pid = slot.leagueParticipantId ?? slot.participant?.id ?? null;
      out.push({
        key: `${slot.id}:bye`,
        slotId: slot.id,
        slotKind: slot.slotKind,
        roundIndex: slot.roundIndex,
        roundLabel: slot.roundLabel,
        seed: slot.seedRank,
        participantId: pid,
        participant: slot.participant ?? null,
        locked,
      });
      continue;
    }

    if (!slot.gameId || !slot.game || !isFullGame(slot.game)) continue;
    if (gameIsFinal(slot.game)) continue;

    const game = slot.game;
    for (const side of ['A', 'B'] as const) {
      const pid = participantIdForGameSide(game, side, pool);
      out.push({
        key: `${slot.id}:${side}`,
        slotId: slot.id,
        slotKind: slot.slotKind,
        roundIndex: slot.roundIndex,
        roundLabel: slot.roundLabel,
        side,
        participantId: pid,
        participant: pid ? pool.get(pid) ?? null : null,
        locked,
      });
    }
  }

  return out;
}

export function editPhaseForPosition(pos: BracketEditPosition): 'play-in' | `main-${number}` {
  if (pos.slotKind === 'BYE' || pos.slotKind === 'PLAY_IN') return 'play-in';
  return `main-${pos.roundIndex}`;
}

export function canSwapBracketPositions(a: BracketEditPosition, b: BracketEditPosition): boolean {
  if (a.locked || b.locked) return false;
  if (a.key === b.key) return false;
  if (!a.participantId || !b.participantId) return false;
  if (a.participantId === b.participantId) return false;
  return editPhaseForPosition(a) === editPhaseForPosition(b);
}

export function swapBracketPositions(
  positions: BracketEditPosition[],
  pool: Map<string, NonNullable<BracketSlotDto['participant']>>,
  keyA: string,
  keyB: string
): BracketEditPosition[] {
  const i = positions.findIndex((p) => p.key === keyA);
  const j = positions.findIndex((p) => p.key === keyB);
  if (i < 0 || j < 0) return positions;
  const a = positions[i];
  const b = positions[j];
  if (!canSwapBracketPositions(a, b)) return positions;

  const pidA = a.participantId;
  const pidB = b.participantId;
  const partA = pidB ? pool.get(pidB) ?? null : null;
  const partB = pidA ? pool.get(pidA) ?? null : null;

  const next = [...positions];
  next[i] = { ...a, participantId: pidB, participant: partA };
  next[j] = { ...b, participantId: pidA, participant: partB };
  return next;
}

export function bracketEditHasChanges(
  baseline: BracketEditPosition[],
  draft: BracketEditPosition[]
): boolean {
  const baseByKey = new Map(baseline.map((p) => [p.key, p]));
  return draft.some((d) => baseByKey.get(d.key)?.participantId !== d.participantId);
}

export function buildBracketSlotPatch(
  baseline: BracketEditPosition[],
  draft: BracketEditPosition[]
): NonNullable<PatchBracketSlotsRequest['slots']> {
  const baseByKey = new Map(baseline.map((p) => [p.key, p]));
  const updates: NonNullable<PatchBracketSlotsRequest['slots']> = [];

  for (const after of draft) {
    const before = baseByKey.get(after.key);
    if (!before || before.participantId === after.participantId) continue;

    if (after.slotKind === 'BYE') {
      updates.push({
        slotId: after.slotId,
        leagueParticipantId: after.participantId,
      });
    } else if (after.side) {
      updates.push({
        slotId: after.slotId,
        side: after.side,
        leagueParticipantId: after.participantId ?? undefined,
      });
    }
  }

  return updates;
}

export function bracketEditIsFullyLocked(positions: BracketEditPosition[]): boolean {
  return !positions.some((p) => !p.locked && p.participantId);
}
