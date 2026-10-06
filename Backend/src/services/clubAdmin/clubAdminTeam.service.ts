import { ClubAdminRole, Prisma } from '@prisma/client';
import type { ClubTeamMember } from '@bandeja/shared/clubAdmin/contract';
import prisma from '../../config/database';
import { clubAdminError, clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';

/**
 * Club team (`ClubAdmin` rows). ADMIN-only (`team.manage`, enforced by the route). A club never
 * loses its last ADMIN through the console (`clubAdmin.lastAdmin`); platform admins are not rows
 * and do not count. `GET /me` reads `clubAdminClubs` from these rows, uncached.
 */

const USER_REF = { select: { id: true, firstName: true, lastName: true, avatar: true } } as const;

function displayName(u: { firstName: string | null; lastName: string | null }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Player';
}

export function parseTeamRole(raw: unknown): ClubAdminRole {
  if (raw !== 'ADMIN' && raw !== 'STAFF') throw clubAdminValidation('role', 'must be ADMIN or STAFF');
  return raw;
}

export async function listTeam(clubId: string, viewerId: string): Promise<ClubTeamMember[]> {
  const rows = await prisma.clubAdmin.findMany({
    where: { clubId },
    include: { user: USER_REF },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    user: r.user,
    role: r.role,
    addedAt: r.createdAt.toISOString(),
    isSelf: r.userId === viewerId,
  }));
}

export async function addTeamMember(actorId: string, clubId: string, body: Record<string, unknown>): Promise<ClubTeamMember[]> {
  const userId = body?.userId;
  if (typeof userId !== 'string' || !userId) throw clubAdminValidation('userId', 'is required');
  const role = parseTeamRole(body?.role);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, firstName: true, lastName: true } });
  if (!user || !user.isActive) throw clubAdminNotFound('User');
  const existing = await prisma.clubAdmin.findUnique({ where: { userId_clubId: { userId, clubId } }, select: { id: true } });
  if (existing) throw clubAdminError(409, 'clubAdmin.alreadyMember', 'Already on the team');
  try {
    await prisma.clubAdmin.create({ data: { userId, clubId, role } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw clubAdminError(409, 'clubAdmin.alreadyMember', 'Already on the team');
    }
    throw err;
  }
  await logClubActivity(clubId, actorId, 'TEAM_ADDED', { user: displayName(user), role });
  return listTeam(clubId, actorId);
}

/**
 * Locks the club's team rows, then refuses when the change would leave no ADMIN.
 * Two admins demoting each other concurrently serialise on the lock.
 */
async function withTeamLock<T>(clubId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClubAdmin" WHERE "clubId" = ${clubId} FOR UPDATE`;
    return fn(tx);
  });
}

async function assertNotLastAdmin(tx: Prisma.TransactionClient, clubId: string, userId: string): Promise<void> {
  const otherAdmins = await tx.clubAdmin.count({ where: { clubId, role: 'ADMIN', userId: { not: userId } } });
  if (otherAdmins === 0) throw clubAdminError(409, 'clubAdmin.lastAdmin', 'A club needs at least one admin');
}

export async function changeTeamRole(
  actorId: string,
  clubId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<ClubTeamMember[]> {
  const role = parseTeamRole(body?.role);
  const member = await withTeamLock(clubId, async (tx) => {
    const row = await tx.clubAdmin.findUnique({ where: { userId_clubId: { userId, clubId } }, include: { user: USER_REF } });
    if (!row) throw clubAdminNotFound('Team member');
    if (row.role === role) return null;
    if (row.role === 'ADMIN') await assertNotLastAdmin(tx, clubId, userId);
    await tx.clubAdmin.update({ where: { id: row.id }, data: { role } });
    return row;
  });
  if (member) await logClubActivity(clubId, actorId, 'TEAM_ROLE_CHANGED', { user: displayName(member.user), role });
  return listTeam(clubId, actorId);
}

export async function removeTeamMember(actorId: string, clubId: string, userId: string): Promise<ClubTeamMember[]> {
  const member = await withTeamLock(clubId, async (tx) => {
    const row = await tx.clubAdmin.findUnique({ where: { userId_clubId: { userId, clubId } }, include: { user: USER_REF } });
    if (!row) throw clubAdminNotFound('Team member');
    if (row.role === 'ADMIN') await assertNotLastAdmin(tx, clubId, userId);
    await tx.clubAdmin.delete({ where: { id: row.id } });
    return row;
  });
  await logClubActivity(clubId, actorId, 'TEAM_REMOVED', { user: displayName(member.user), role: member.role });
  return listTeam(clubId, actorId);
}
