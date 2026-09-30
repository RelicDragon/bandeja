/**
 * Shared pieces of the agent write tools (`gameWrites.tools.ts`, `rosterWrites.tools.ts`):
 * the game row they load, preview formatting and plan parsing.
 */
import { EntityType, ParticipantStatus, type Prisma } from '@prisma/client';
import type { z } from 'zod/v4';
import type { AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { findOverlappingPlayingGames } from '../../game/gameSlotOverlap.service';
import { isValidTimeZone } from '../agentContext.service';
import { agentGameEntity, agentGameSummarySelect } from '../dto/game.dto';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';

const DESCRIPTION_PREVIEW_MAX = 80;
/** League shells and fixtures have their own roster flows; the agent doesn't touch them. */
const ROSTER_BLOCKED_ENTITY_TYPES: EntityType[] = [EntityType.LEAGUE, EntityType.LEAGUE_SEASON];

export const GAME_WRITE_SELECT = {
  id: true,
  name: true,
  description: true,
  entityType: true,
  sport: true,
  status: true,
  resultsStatus: true,
  startTime: true,
  endTime: true,
  timeIsSet: true,
  maxParticipants: true,
  isPublic: true,
  allowDirectJoin: true,
  parentId: true,
  cityId: true,
  clubId: true,
  courtId: true,
  city: { select: { timezone: true } },
  club: { select: { id: true, name: true } },
  court: { select: { id: true, name: true, clubId: true } },
  _count: {
    select: {
      gameCourts: true,
      externalBookings: true,
      participants: { where: { status: ParticipantStatus.PLAYING } },
    },
  },
} satisfies Prisma.GameSelect;

export type GameWriteRow = Prisma.GameGetPayload<{ select: typeof GAME_WRITE_SELECT }>;

export async function loadGameForWrite(gameId: string): Promise<GameWriteRow> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: GAME_WRITE_SELECT });
  if (!game) throw new ApiError(404, 'Game not found');
  return game;
}

export function gameTimezone(game: { city: { timezone: string } | null }, fallback: string): string {
  return isValidTimeZone(game.city?.timezone) ? game.city!.timezone : fallback;
}

export function when(game: { timeIsSet: boolean; startTime: Date }, timezone: string, locale: string): string {
  return game.timeIsSet ? formatAgentDateTime(game.startTime, timezone, locale) : agentT(locale, 'value.notSet');
}

export function clip(text: string | null | undefined, max = DESCRIPTION_PREVIEW_MAX): string | null {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function gameEntityFor(gameId: string, viewerId: string): Promise<AgentEntityRef[]> {
  const row = await prisma.game.findUnique({ where: { id: gameId }, select: agentGameSummarySelect(viewerId) });
  return row ? [agentGameEntity(row)] : [];
}

export async function myParticipant(gameId: string, userId: string) {
  return prisma.gameParticipant.findFirst({
    where: { gameId, userId },
    select: { role: true, status: true },
  });
}

export async function overlapWarning(
  userId: string,
  target: { id: string; startTime: Date; endTime: Date; timeIsSet: boolean },
  timezone: string,
  locale: string,
): Promise<string | null> {
  if (!target.timeIsSet || !(target.startTime < target.endTime)) return null;
  const overlapping = await findOverlappingPlayingGames(userId, target);
  const first = overlapping[0];
  if (!first) return null;
  return agentT(locale, 'warn.overlap', {
    game: clip(first.name, 40) ?? agentT(locale, 'value.notSet'),
    time: formatAgentDateTime(new Date(first.startTime), timezone, locale),
  });
}

export function parsePlan<T>(schema: z.ZodType<T>, plan: unknown): T {
  const parsed = schema.safeParse(plan);
  if (!parsed.success) throw new Error('stored agent action plan is invalid');
  return parsed.data;
}

export function line(label: string, from: string | null, to: string | null): AgentActionPreviewLine {
  return { label, from, to };
}

export function assertRosterToolSupported(game: Pick<GameWriteRow, 'entityType'>): void {
  if (ROSTER_BLOCKED_ENTITY_TYPES.includes(game.entityType)) {
    throw new ApiError(400, 'League rosters are managed in the app');
  }
}
