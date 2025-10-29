import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { MediaCleanupService } from '../mediaCleanup.service';
import { Gender } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class AdminUsersService {
  static async getAllUsers(cityId?: string) {
    const users = await prisma.user.findMany({
      where: cityId ? { currentCityId: cityId } : undefined,
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
        totalPoints: true,
        gamesPlayed: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users;
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
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        isActive: true,
      },
    });

    return updatedUser;
  }

  static async createUser(data: {
    phone: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    gender: Gender;
    level?: number;
    currentCityId?: string;
    isActive?: boolean;
    isAdmin?: boolean;
    isTrainer?: boolean;
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
    } = data;

    if (!phone) {
      throw new ApiError(400, 'Phone number is required');
    }

    if (!gender) {
      throw new ApiError(400, 'Gender is required');
    }

    const combinedName = `${firstName || ''}${lastName || ''}`.trim();
    const alphabeticChars = combinedName.replace(/[^a-zA-Z]/g, '');
    
    if (alphabeticChars.length < 3) {
      throw new ApiError(400, 'First name and last name combined must contain at least 3 alphabetic characters');
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

    const user = await prisma.user.create({
      data: {
        phone,
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
      },
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
        currentCityId: true,
        createdAt: true,
      },
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
    } = data;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new ApiError(404, 'User not found');
    }

    if (firstName !== undefined || lastName !== undefined) {
      const newFirstName = firstName !== undefined ? firstName : existingUser.firstName;
      const newLastName = lastName !== undefined ? lastName : existingUser.lastName;
      const combinedName = `${newFirstName || ''}${newLastName || ''}`.trim();
      const alphabeticChars = combinedName.replace(/[^a-zA-Z]/g, '');
      
      if (alphabeticChars.length < 3) {
        throw new ApiError(400, 'First name and last name combined must contain at least 3 alphabetic characters');
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
        ...(level !== undefined && { level }),
        ...(currentCityId !== undefined && { currentCityId }),
        ...(isActive !== undefined && { isActive }),
        ...(isAdmin !== undefined && { isAdmin }),
        ...(isTrainer !== undefined && { isTrainer }),
      },
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
        currentCityId: true,
        createdAt: true,
      },
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
      select: { id: true, firstName: true, lastName: true, isAdmin: true }
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
