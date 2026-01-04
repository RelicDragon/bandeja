import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { EntityType } from '@prisma/client';
import { getUserTimezoneFromCityId } from './user-timezone.service';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export interface CreateSubscriptionDto {
  cityId: string;
  clubIds?: string[];
  entityTypes?: EntityType[];
  dayOfWeek?: number[];
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  startTime?: string | null;
  endTime?: string | null;
  minLevel?: number;
  maxLevel?: number;
  myGenderOnly?: boolean;
}

export interface UpdateSubscriptionDto extends Partial<CreateSubscriptionDto> {
  isActive?: boolean;
}

const MINUTES_IN_DAY = 1440;

const timeStringToMinutes = (time: string | null): number => {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export class GameSubscriptionService {
  static async getUserSubscriptions(userId: string) {
    return await prisma.gameSubscription.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            country: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  static async createSubscription(userId: string, data: CreateSubscriptionDto) {
    const startDate = data.startDate 
      ? (data.startDate instanceof Date ? data.startDate : new Date(data.startDate))
      : undefined;
    const endDate = data.endDate 
      ? (data.endDate instanceof Date ? data.endDate : new Date(data.endDate))
      : undefined;

    if (endDate && startDate && endDate < startDate) {
      throw new ApiError(400, 'End date must be after start date');
    }

    if (data.maxLevel !== undefined && data.minLevel !== undefined && data.maxLevel < data.minLevel) {
      throw new ApiError(400, 'Max level must be greater than or equal to min level');
    }

    if (data.dayOfWeek && data.dayOfWeek.some(day => day < 0 || day > 6)) {
      throw new ApiError(400, 'Day of week must be between 0 and 6');
    }

    if (data.startTime) {
      if (!/^\d{2}:\d{2}$/.test(data.startTime)) {
        throw new ApiError(400, 'Start time must be in HH:MM format');
      }
      if (data.startTime !== '24:00') {
        const [hours, minutes] = data.startTime.split(':').map(Number);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          throw new ApiError(400, 'Start time hours must be 0-23 and minutes must be 0-59');
        }
      }
    }

    if (data.endTime) {
      if (!/^\d{2}:\d{2}$/.test(data.endTime)) {
        throw new ApiError(400, 'End time must be in HH:MM format');
      }
      const [hours, minutes] = data.endTime.split(':').map(Number);
      if (data.endTime === '24:00') {
        // 24:00 is valid, represents end of day
      } else if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new ApiError(400, 'End time hours must be 0-23 and minutes must be 0-59');
      }
    }

    if (data.startTime && data.endTime) {
      const startTimeMinutes = timeStringToMinutes(data.startTime);
      const endTimeMinutes = timeStringToMinutes(data.endTime);
      if (startTimeMinutes >= endTimeMinutes) {
        throw new ApiError(400, 'Start time must be before end time');
      }
    }

    const city = await prisma.city.findUnique({
      where: { id: data.cityId },
    });

    if (!city) {
      throw new ApiError(404, 'City not found');
    }

    if (data.clubIds && data.clubIds.length > 0) {
      const clubs = await prisma.club.findMany({
        where: {
          id: { in: data.clubIds },
          cityId: data.cityId,
        },
      });

      if (clubs.length !== data.clubIds.length) {
        throw new ApiError(400, 'One or more clubs not found or not in the specified city');
      }
    }

    return await prisma.gameSubscription.create({
      data: {
        userId,
        cityId: data.cityId,
        clubIds: data.clubIds || [],
        entityTypes: data.entityTypes || [],
        dayOfWeek: data.dayOfWeek || [],
        startDate: startDate,
        endDate: endDate,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        myGenderOnly: data.myGenderOnly || false,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            country: true,
          },
        },
      },
    });
  }

  static async updateSubscription(
    subscriptionId: string,
    userId: string,
    data: UpdateSubscriptionDto
  ) {
    const subscription = await prisma.gameSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new ApiError(404, 'Subscription not found');
    }

    if (subscription.userId !== userId) {
      throw new ApiError(403, 'Not authorized to update this subscription');
    }

    const startDate = data.startDate !== undefined 
      ? (data.startDate ? (data.startDate instanceof Date ? data.startDate : new Date(data.startDate)) : null)
      : undefined;
    const endDate = data.endDate !== undefined 
      ? (data.endDate ? (data.endDate instanceof Date ? data.endDate : new Date(data.endDate)) : null)
      : undefined;

    const startDateForValidation = startDate !== undefined ? startDate : subscription.startDate;
    const endDateForValidation = endDate !== undefined ? endDate : subscription.endDate;
    if (startDateForValidation && endDateForValidation && endDateForValidation < startDateForValidation) {
      throw new ApiError(400, 'End date must be after start date');
    }

    if (data.minLevel !== undefined && data.maxLevel !== undefined) {
      if (data.minLevel !== null && data.maxLevel !== null && data.maxLevel < data.minLevel) {
        throw new ApiError(400, 'Max level must be greater than or equal to min level');
      }
    } else if (data.minLevel !== undefined) {
      const maxLevelForValidation = subscription.maxLevel;
      if (data.minLevel !== null && maxLevelForValidation !== null && maxLevelForValidation !== undefined && 
          maxLevelForValidation < data.minLevel) {
        throw new ApiError(400, 'Max level must be greater than or equal to min level');
      }
    } else if (data.maxLevel !== undefined) {
      const minLevelForValidation = subscription.minLevel;
      if (data.maxLevel !== null && minLevelForValidation !== null && minLevelForValidation !== undefined && 
          data.maxLevel < minLevelForValidation) {
        throw new ApiError(400, 'Max level must be greater than or equal to min level');
      }
    }

    if (data.dayOfWeek && data.dayOfWeek.some(day => day < 0 || day > 6)) {
      throw new ApiError(400, 'Day of week must be between 0 and 6');
    }

    if (data.startTime !== undefined && data.startTime !== null) {
      if (!/^\d{2}:\d{2}$/.test(data.startTime)) {
        throw new ApiError(400, 'Start time must be in HH:MM format');
      }
      if (data.startTime !== '24:00') {
        const [hours, minutes] = data.startTime.split(':').map(Number);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          throw new ApiError(400, 'Start time hours must be 0-23 and minutes must be 0-59');
        }
      }
    }

    if (data.endTime !== undefined && data.endTime !== null) {
      if (!/^\d{2}:\d{2}$/.test(data.endTime)) {
        throw new ApiError(400, 'End time must be in HH:MM format');
      }
      const [hours, minutes] = data.endTime.split(':').map(Number);
      if (data.endTime === '24:00') {
        // 24:00 is valid, represents end of day
      } else if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new ApiError(400, 'End time hours must be 0-23 and minutes must be 0-59');
      }
    }

    const startTimeForValidation = data.startTime !== undefined ? data.startTime : subscription.startTime;
    const endTimeForValidation = data.endTime !== undefined ? data.endTime : subscription.endTime;
    if (startTimeForValidation && endTimeForValidation) {
      const startTimeMinutes = timeStringToMinutes(startTimeForValidation);
      const endTimeMinutes = timeStringToMinutes(endTimeForValidation);
      if (startTimeMinutes >= endTimeMinutes) {
        throw new ApiError(400, 'Start time must be before end time');
      }
    }

    const cityId = data.cityId || subscription.cityId;
    if (data.clubIds !== undefined) {
      if (data.clubIds.length > 0) {
        const clubs = await prisma.club.findMany({
          where: {
            id: { in: data.clubIds },
            cityId: cityId,
          },
        });

        if (clubs.length !== data.clubIds.length) {
          throw new ApiError(400, 'One or more clubs not found or not in the specified city');
        }
      }
    }

    if (data.cityId) {
      const city = await prisma.city.findUnique({
        where: { id: data.cityId },
      });

      if (!city) {
        throw new ApiError(404, 'City not found');
      }
    }

    return await prisma.gameSubscription.update({
      where: { id: subscriptionId },
      data: {
        cityId: data.cityId,
        clubIds: data.clubIds !== undefined ? data.clubIds : undefined,
        entityTypes: data.entityTypes !== undefined ? data.entityTypes : undefined,
        dayOfWeek: data.dayOfWeek !== undefined ? data.dayOfWeek : undefined,
        startDate: startDate,
        endDate: endDate,
        startTime: data.startTime !== undefined ? data.startTime : undefined,
        endTime: data.endTime !== undefined ? data.endTime : undefined,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        myGenderOnly: data.myGenderOnly,
        isActive: data.isActive,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            country: true,
          },
        },
      },
    });
  }

  static async deleteSubscription(subscriptionId: string, userId: string) {
    const subscription = await prisma.gameSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new ApiError(404, 'Subscription not found');
    }

    if (subscription.userId !== userId) {
      throw new ApiError(403, 'Not authorized to delete this subscription');
    }

    await prisma.gameSubscription.delete({
      where: { id: subscriptionId },
    });
  }

  static async checkGameMatchesSubscriptions(game: any, userId: string): Promise<boolean> {
    if (!game || !game.cityId || !game.startTime || !game.entityType) {
      return false;
    }

    const subscriptions = await prisma.gameSubscription.findMany({
      where: {
        userId,
        isActive: true,
        cityId: game.cityId,
      },
    });

    if (subscriptions.length === 0) {
      return false;
    }

    const gameStartTime = new Date(game.startTime);
    if (isNaN(gameStartTime.getTime())) {
      return false;
    }

    const cityTimezone = await getUserTimezoneFromCityId(game.cityId);
    const gameStartTimeInCityTz = toZonedTime(gameStartTime, cityTimezone);
    const gameDayOfWeek = gameStartTimeInCityTz.getDay();
    const gameDateStr = format(gameStartTimeInCityTz, 'yyyy-MM-dd');

    const needsGenderCheck = subscriptions.some(sub => sub.myGenderOnly);
    let userGender: string | null = null;
    if (needsGenderCheck) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { gender: true },
      });
      userGender = user?.gender || null;
    }

    for (const subscription of subscriptions) {
      if (subscription.entityTypes.length > 0 && !subscription.entityTypes.includes(game.entityType)) {
        continue;
      }

      if (subscription.clubIds.length > 0) {
        if (!game.clubId || !subscription.clubIds.includes(game.clubId)) {
          continue;
        }
      }

      if (subscription.dayOfWeek.length > 0 && !subscription.dayOfWeek.includes(gameDayOfWeek)) {
        continue;
      }

      if (subscription.startDate) {
        const subscriptionStartDateInCityTz = toZonedTime(new Date(subscription.startDate), cityTimezone);
        const subscriptionStartDateStr = format(subscriptionStartDateInCityTz, 'yyyy-MM-dd');
        if (gameDateStr < subscriptionStartDateStr) {
          continue;
        }
      }

      if (subscription.endDate) {
        const subscriptionEndDateInCityTz = toZonedTime(new Date(subscription.endDate), cityTimezone);
        const subscriptionEndDateStr = format(subscriptionEndDateInCityTz, 'yyyy-MM-dd');
        if (gameDateStr > subscriptionEndDateStr) {
          continue;
        }
      }

      if (subscription.startTime || subscription.endTime) {
        const gameHours = gameStartTimeInCityTz.getHours();
        const gameMinutes = gameStartTimeInCityTz.getMinutes();
        const gameTimeMinutes = gameHours * 60 + gameMinutes;

        if (subscription.startTime) {
          const startTimeMinutes = timeStringToMinutes(subscription.startTime);
          if (gameTimeMinutes < startTimeMinutes) {
            continue;
          }
        }

        if (subscription.endTime) {
          const endTimeMinutes = timeStringToMinutes(subscription.endTime);
          if (gameTimeMinutes >= endTimeMinutes) {
            continue;
          }
        }
      }

      const subscriptionHasMinLevel = subscription.minLevel !== null && subscription.minLevel !== undefined;
      const subscriptionHasMaxLevel = subscription.maxLevel !== null && subscription.maxLevel !== undefined;
      const gameHasMinLevel = game.minLevel !== null && game.minLevel !== undefined;
      const gameHasMaxLevel = game.maxLevel !== null && game.maxLevel !== undefined;

      if (subscriptionHasMinLevel || subscriptionHasMaxLevel) {
        if (gameHasMinLevel && gameHasMaxLevel) {
          const gameMin = game.minLevel!;
          const gameMax = game.maxLevel!;
          const subMin = subscriptionHasMinLevel && subscription.minLevel !== null ? subscription.minLevel : -Infinity;
          const subMax = subscriptionHasMaxLevel && subscription.maxLevel !== null ? subscription.maxLevel : Infinity;

          if (gameMax < subMin || gameMin > subMax) {
            continue;
          }
        } else if (gameHasMinLevel) {
          if (subscriptionHasMaxLevel && subscription.maxLevel !== null && game.minLevel! > subscription.maxLevel) {
            continue;
          }
          if (subscriptionHasMinLevel && subscription.minLevel !== null && game.minLevel! < subscription.minLevel) {
            continue;
          }
        } else if (gameHasMaxLevel) {
          if (subscriptionHasMinLevel && subscription.minLevel !== null && game.maxLevel! < subscription.minLevel) {
            continue;
          }
          if (subscriptionHasMaxLevel && subscription.maxLevel !== null && game.maxLevel! > subscription.maxLevel) {
            continue;
          }
        }
      }

      if (subscription.myGenderOnly) {
        if (game.genderTeams !== 'MIXED' && game.genderTeams !== 'ANY') {
          if (userGender && userGender !== 'PREFER_NOT_TO_SAY') {
            if (game.genderTeams === 'MEN' && userGender !== 'MALE') {
              continue;
            }
            if (game.genderTeams === 'WOMEN' && userGender !== 'FEMALE') {
              continue;
            }
          } else if (game.genderTeams === 'MEN' || game.genderTeams === 'WOMEN') {
            continue;
          }
        }
      }

      return true;
    }

    return false;
  }
}

