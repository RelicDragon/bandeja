import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { MediaCleanupService } from '../mediaCleanup.service';
import { Gender } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PROFILE_SELECT_FIELDS, USER_SELECT_FIELDS } from '../../utils/constants';

const USERS_PAGE_SIZE = 50;

export class AdminUsersService {
  static async getAllUsers(params: { cityId?: string; search?: string; page?: number }) {
    const { cityId, search, page = 1 } = params;
    const skip = (page - 1) * USERS_PAGE_SIZE;

    const where: Prisma.UserWhereInput = {};
    if (cityId) where.currentCityId = cityId;
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
    currentCityId?: string;
    isActive?: boolean;
    isAdmin?: boolean;
    isTrainer?: boolean;
    canCreateTournament?: boolean;
    canCreateLeague?: boolean;
  }) {
    const {
      phone,
      password,
      email,
      firstName,
      lastName,
      gender,
      level,
      currentCityId,
      isActive,
      isAdmin,
      isTrainer,
      canCreateTournament,
      canCreateLeague,
    } = data;

    if (!phone) {
      throw new ApiError(400, 'Phone number is required');
    }

    if (!gender) {
      throw new ApiError(400, 'Gender is required');
    }

    const trimmedFirst = (firstName || '').trim();
    const trimmedLast = (lastName || '').trim();
    
    if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      throw new ApiError(400, 'At least one name must have at least 3 characters');
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
      const { hashPassword } = await import('../../utils/hash');
      passwordHash = await hashPassword(password);
    }

    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash,
        email,
        firstName,
        lastName,
        gender,
        authProvider: 'PHONE',
        level: level !== undefined ? level : 3.5,
        currentCityId,
        isActive: isActive !== undefined ? isActive : true,
        isAdmin: isAdmin !== undefined ? isAdmin : false,
        isTrainer: isTrainer !== undefined ? isTrainer : false,
        canCreateTournament: canCreateTournament !== undefined ? canCreateTournament : false,
        canCreateLeague: canCreateLeague !== undefined ? canCreateLeague : false,
      },
      select: PROFILE_SELECT_FIELDS,
    });

    return user;
  }

  static async updateUser(userId: string, data: {
    phone?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    gender?: Gender;
    level?: number;
    currentCityId?: string;
    isActive?: boolean;
    isAdmin?: boolean;
    isTrainer?: boolean;
    canCreateTournament?: boolean;
    canCreateLeague?: boolean;
  }) {
    const {
      phone,
      email,
      firstName,
      lastName,
      gender,
      level,
      currentCityId,
      isActive,
      isAdmin,
      isTrainer,
      canCreateTournament,
      canCreateLeague,
    } = data;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new ApiError(404, 'User not found');
    }

    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName : existingUser.firstName || '';
      const newLastName = lastName !== undefined ? lastName : existingUser.lastName || '';
      const trimmedFirst = (newFirstName || '').trim();
      const trimmedLast = (newLastName || '').trim();
      
      if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
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

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(gender !== undefined && { gender }),
        ...(level !== undefined && { level: Math.max(1.0, Math.min(7.0, level)) }),
        ...(currentCityId !== undefined && { currentCityId }),
        ...(isActive !== undefined && { isActive }),
        ...(isAdmin !== undefined && { isAdmin }),
        ...(isTrainer !== undefined && { isTrainer }),
        ...(canCreateTournament !== undefined && { canCreateTournament }),
        ...(canCreateLeague !== undefined && { canCreateLeague }),
      },
      select: PROFILE_SELECT_FIELDS,
    });

    return user;
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

    const { hashPassword } = await import('../../utils/hash');
    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

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
