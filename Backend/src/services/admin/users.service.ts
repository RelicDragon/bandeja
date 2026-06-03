import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { MediaCleanupService } from '../mediaCleanup.service';
import { hashPassword } from '../../utils/hash';
import { Gender, Sport, SportLevelSource } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PROFILE_SELECT_FIELDS, USER_SELECT_FIELDS } from '../../utils/constants';
import { resolveDisplayNameData } from '../user/userDisplayName.service';
import { revokeAllRefreshSessionsForUser } from '../auth/userRefreshSession.service';
import {
  addUserSport,
  clampSportLevel,
  loadProfileUser,
  parseSportParam,
  reconcilePrimarySport,
  removeUserSport,
  setUserPrimarySport,
} from '../user/userSportProfile.service';

const USERS_PAGE_SIZE = 50;

type SportProfileLevelInput = { sport: string; level: number };

async function applySportProfileLevelUpdates(
  userId: string,
  sportProfileLevels: SportProfileLevelInput[],
): Promise<void> {
  for (const entry of sportProfileLevels) {
    const sport = parseSportParam(entry.sport);
    const level = clampSportLevel(entry.level);
    await prisma.userSportProfile.upsert({
      where: { userId_sport: { userId, sport } },
      create: {
        userId,
        sport,
        level,
        levelSource: SportLevelSource.MANUAL,
      },
      update: {
        level,
        levelSource: SportLevelSource.MANUAL,
      },
    });
    if (sport === Sport.PADEL) {
      await prisma.user.update({
        where: { id: userId },
        data: { level },
      });
    }
  }
}

export class AdminUsersService {
  static async getAllUsers(params: {
    cityId?: string;
    search?: string;
    page?: number;
    primarySport?: string;
    hasSport?: string;
  }) {
    const { cityId, search, page = 1, primarySport, hasSport } = params;
    const skip = (page - 1) * USERS_PAGE_SIZE;

    const where: Prisma.UserWhereInput = {};
    if (cityId) where.currentCityId = cityId;
    if (primarySport) {
      where.primarySport = parseSportParam(primarySport);
    }
    if (hasSport) {
      where.sportsEnabled = { has: parseSportParam(hasSport) };
    }
    if (search && search.trim()) {
      where.OR = [
        { firstName: { contains: search.trim(), mode: 'insensitive' } },
        { lastName: { contains: search.trim(), mode: 'insensitive' } },
        { phone: { contains: search.trim(), mode: 'insensitive' } },
        { email: { contains: search.trim(), mode: 'insensitive' } },
        { telegramUsername: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          ...PROFILE_SELECT_FIELDS,
          totalPoints: true,
          gamesPlayed: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: USERS_PAGE_SIZE,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, pageSize: USERS_PAGE_SIZE };
  }

  static async getUsersByIds(ids: string[]) {
    if (!ids.length) return [];
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: PROFILE_SELECT_FIELDS,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  static async toggleUserStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: PROFILE_SELECT_FIELDS,
    });

    return updatedUser;
  }

  static async createUser(data: {
    phone: string;
    password?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    gender: Gender;
    level?: number;
    primarySport?: string;
    sportsEnabled?: string[];
    sportProfileLevels?: SportProfileLevelInput[];
    currentCityId?: string;
    isActive?: boolean;
    isAdmin?: boolean;
    isTrainer?: boolean;
    canCreateTournament?: boolean;
    canCreateLeague?: boolean;
    maxParticipantsInGame?: number;
  }) {
    const {
      phone,
      password,
      email,
      firstName,
      lastName,
      gender,
      level,
      primarySport: primarySportRaw,
      sportsEnabled: sportsEnabledRaw,
      sportProfileLevels,
      currentCityId,
      isActive,
      isAdmin,
      isTrainer,
      canCreateTournament,
      canCreateLeague,
      maxParticipantsInGame,
    } = data;

    if (!phone) {
      throw new ApiError(400, 'Phone number is required');
    }

    if (!gender) {
      throw new ApiError(400, 'Gender is required');
    }

    const nameResolved = resolveDisplayNameData(firstName, lastName);
    if (nameResolved.nameIsSet) {
      const tf = (nameResolved.firstName || '').trim();
      const tl = (nameResolved.lastName || '').trim();
      if (tf.length < 3 && tl.length < 3) {
        throw new ApiError(400, 'At least one name must have at least 3 characters');
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ApiError(400, 'User with this phone number already exists');
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        throw new ApiError(400, 'User with this email already exists');
      }
    }

    let passwordHash: string | undefined;
    if (password) {
      if (password.length < 6) {
        throw new ApiError(400, 'Password must be at least 6 characters');
      }
      passwordHash = await hashPassword(password);
    }

    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash,
        email,
        firstName: nameResolved.firstName,
        lastName: nameResolved.lastName ?? null,
        nameIsSet: nameResolved.nameIsSet,
        gender,
        level: level !== undefined ? clampSportLevel(level) : 3.5,
        currentCityId,
        isActive: isActive !== undefined ? isActive : true,
        isAdmin: isAdmin !== undefined ? isAdmin : false,
        isTrainer: isTrainer !== undefined ? isTrainer : false,
        canCreateTournament: canCreateTournament !== undefined ? canCreateTournament : false,
        canCreateLeague: canCreateLeague !== undefined ? canCreateLeague : false,
        ...(maxParticipantsInGame !== undefined && {
          maxParticipantsInGame: Math.max(2, Math.min(999, Math.floor(maxParticipantsInGame))),
        }),
      },
      select: PROFILE_SELECT_FIELDS,
    });

    const enabledSports = sportsEnabledRaw?.length
      ? sportsEnabledRaw.map((s) => parseSportParam(s))
      : [parseSportParam(primarySportRaw ?? Sport.PADEL)];
    const primarySport = reconcilePrimarySport(
      parseSportParam(primarySportRaw ?? enabledSports[0]!),
      enabledSports,
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        primarySport,
        sportsEnabled: enabledSports,
        primarySportIsSet: true,
      },
    });

    const levelBySport = new Map(
      (sportProfileLevels ?? []).map((e) => [parseSportParam(e.sport), clampSportLevel(e.level)]),
    );
    for (const sport of enabledSports) {
      const sportLevel =
        levelBySport.get(sport) ??
        (sport === Sport.PADEL && level !== undefined ? clampSportLevel(level) : 1.0);
      await applySportProfileLevelUpdates(user.id, [{ sport, level: sportLevel }]);
    }

    return loadProfileUser(user.id);
  }

  static async updateUser(userId: string, data: {
    phone?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    gender?: Gender;
    level?: number;
    primarySport?: string;
    sportsEnabled?: string[];
    addSport?: string;
    removeSport?: string;
    sportProfileLevels?: SportProfileLevelInput[];
    currentCityId?: string;
    isActive?: boolean;
    isAdmin?: boolean;
    isTrainer?: boolean;
    canCreateTournament?: boolean;
    canCreateLeague?: boolean;
    maxParticipantsInGame?: number;
  }) {
    const {
      phone,
      email,
      firstName,
      lastName,
      gender,
      level,
      primarySport: primarySportRaw,
      sportsEnabled: sportsEnabledRaw,
      addSport,
      removeSport,
      sportProfileLevels,
      currentCityId,
      isActive,
      isAdmin,
      isTrainer,
      canCreateTournament,
      canCreateLeague,
      maxParticipantsInGame,
    } = data;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        sportsEnabled: true,
        primarySport: true,
      },
    });

    if (!existingUser) {
      throw new ApiError(404, 'User not found');
    }

    const nameResolvedForUpdate =
      firstName !== undefined || lastName !== undefined
        ? resolveDisplayNameData(
            firstName !== undefined ? firstName : existingUser.firstName,
            lastName !== undefined ? lastName : existingUser.lastName
          )
        : null;

    if (nameResolvedForUpdate?.nameIsSet) {
      const tf = (nameResolvedForUpdate.firstName || '').trim();
      const tl = (nameResolvedForUpdate.lastName || '').trim();
      if (tf.length < 3 && tl.length < 3) {
        throw new ApiError(400, 'At least one name must have at least 3 characters');
      }
    }

    if (phone && phone !== existingUser.phone) {
      const phoneExists = await prisma.user.findUnique({
        where: { phone },
      });
      if (phoneExists) {
        throw new ApiError(400, 'User with this phone number already exists');
      }
    }

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });
      if (emailExists) {
        throw new ApiError(400, 'User with this email already exists');
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(nameResolvedForUpdate && {
          firstName: nameResolvedForUpdate.firstName ?? null,
          lastName: nameResolvedForUpdate.lastName ?? null,
          nameIsSet: nameResolvedForUpdate.nameIsSet,
        }),
        ...(gender !== undefined && { gender }),
        ...(currentCityId !== undefined && { currentCityId }),
        ...(isActive !== undefined && { isActive }),
        ...(isAdmin !== undefined && { isAdmin }),
        ...(isTrainer !== undefined && { isTrainer }),
        ...(canCreateTournament !== undefined && { canCreateTournament }),
        ...(canCreateLeague !== undefined && { canCreateLeague }),
        ...(maxParticipantsInGame !== undefined && {
          maxParticipantsInGame: Math.max(2, Math.min(999, Math.floor(maxParticipantsInGame))),
        }),
      },
    });

    if (removeSport) {
      await removeUserSport(userId, parseSportParam(removeSport));
    }
    if (addSport) {
      await addUserSport(userId, parseSportParam(addSport));
    }

    if (sportsEnabledRaw !== undefined) {
      const newEnabled = sportsEnabledRaw.map((s) => parseSportParam(s));
      if (newEnabled.length === 0) {
        throw new ApiError(400, 'At least one sport must be enabled');
      }
      const currentEnabled = existingUser?.sportsEnabled ?? [Sport.PADEL];
      for (const sport of currentEnabled) {
        if (!newEnabled.includes(sport)) {
          await removeUserSport(userId, sport);
        }
      }
      for (const sport of newEnabled) {
        if (!currentEnabled.includes(sport)) {
          await addUserSport(userId, sport);
        }
      }
      const primarySport = reconcilePrimarySport(
        primarySportRaw !== undefined ? parseSportParam(primarySportRaw) : existingUser?.primarySport,
        newEnabled,
      );
      if (!newEnabled.includes(primarySport)) {
        throw new ApiError(400, 'Primary sport must be in sports enabled');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { sportsEnabled: newEnabled, primarySport },
      });
    } else if (primarySportRaw !== undefined) {
      await setUserPrimarySport(userId, parseSportParam(primarySportRaw));
    }

    const levelUpdates =
      sportProfileLevels ??
      (level !== undefined ? [{ sport: Sport.PADEL, level }] : undefined);
    if (levelUpdates?.length) {
      await applySportProfileLevelUpdates(userId, levelUpdates);
    }

    return loadProfileUser(userId);
  }

  static async resetUserPassword(userId: string, newPassword: string) {
    if (!newPassword) {
      throw new ApiError(400, 'New password is required');
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters long');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await revokeAllRefreshSessionsForUser(userId);

    return { message: 'Password reset successfully' };
  }

  static async deleteUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_SELECT_FIELDS, isAdmin: true }
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Prevent deletion of admin users
    if (user.isAdmin) {
      throw new ApiError(403, 'Cannot delete admin users');
    }

    // Clean up user's media files before deletion
    await MediaCleanupService.cleanupUserMedia(userId);

    // Delete the user (this will cascade delete all related records)
    await prisma.user.delete({
      where: { id: userId }
    });

    return { message: 'User deleted successfully' };
  }
}
