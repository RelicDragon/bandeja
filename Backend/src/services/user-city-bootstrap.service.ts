import type { Request } from 'express';
import prisma from '../config/database';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { getClientIp, getLocationByIp } from './ipLocation.service';
import { CityGroupService } from './chat/cityGroup.service';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getNearestCityIdByCoords(latitude: number, longitude: number): Promise<string | null> {
  const cities = await prisma.city.findMany({
    where: {
      isCorrect: true,
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
    },
  });

  if (cities.length === 0) return null;

  let nearestCityId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    if (city.latitude == null || city.longitude == null) continue;
    const distance = haversineKm(latitude, longitude, city.latitude, city.longitude);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCityId = city.id;
    }
  }

  return nearestCityId;
}

export async function ensureUserCityAssigned(userId: string, req?: Request) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentCityId: true,
      latitudeByIP: true,
      longitudeByIP: true,
    },
  });

  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  if (existing.currentCityId) {
    await CityGroupService.ensureCityGroupExists(existing.currentCityId);
    await CityGroupService.addUserToCityGroup(userId, existing.currentCityId, { mute: true, pin: true });
    const userWithCity = await prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT_FIELDS,
    });
    if (!userWithCity) throw new ApiError(404, 'User not found');
    return userWithCity;
  }

  let latitude = existing.latitudeByIP ?? null;
  let longitude = existing.longitudeByIP ?? null;

  if ((latitude == null || longitude == null) && req) {
    const ip = await getClientIp(req);
    if (ip) {
      const loc = await getLocationByIp(ip);
      if (loc) {
        latitude = loc.latitude;
        longitude = loc.longitude;
        await prisma.user.update({
          where: { id: userId },
          data: {
            lastUserIP: ip,
            latitudeByIP: loc.latitude,
            longitudeByIP: loc.longitude,
          },
        });
      }
    }
  }

  let cityId: string | null = null;
  if (latitude != null && longitude != null) {
    cityId = await getNearestCityIdByCoords(latitude, longitude);
  }

  if (!cityId && config.fallbackCityId) {
    cityId = config.fallbackCityId;
  }

  if (!cityId) {
    throw new ApiError(409, 'auth.cityAutoDetectFailed');
  }

  const city = await prisma.city.findFirst({
    where: {
      id: cityId,
      isCorrect: true,
      isActive: true,
    },
    select: { id: true },
  });

  if (!city) {
    throw new ApiError(409, 'auth.cityAutoDetectFailed');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { currentCityId: city.id },
    select: PROFILE_SELECT_FIELDS,
  });

  await CityGroupService.ensureCityGroupExists(city.id);
  await CityGroupService.addUserToCityGroup(userId, city.id, { mute: true, pin: true });

  return user;
}

