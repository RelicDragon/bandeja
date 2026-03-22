import type { Request } from 'express';
import prisma from '../config/database';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { getClientIp, getLocationByIp } from './ipLocation.service';
import { CityGroupService } from './chat/cityGroup.service';

const LOG = '[cityBootstrap]';

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

  if (cities.length === 0) {
    console.warn(LOG, 'nearestCity: zero eligible cities (isCorrect+isActive+lat/lon)');
    return null;
  }

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

  if (nearestCityId) {
    console.log(LOG, 'nearestCity picked', { cityId: nearestCityId, distanceKm: Math.round(nearestDistance * 100) / 100, poolSize: cities.length });
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
    console.log(LOG, 'skip: user already has currentCityId', { userId, currentCityId: existing.currentCityId });
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
  const hadStoredIpCoords = latitude != null && longitude != null;

  if ((latitude == null || longitude == null) && req) {
    const ip = await getClientIp(req);
    if (!ip) {
      console.warn(LOG, 'no client IP resolved', { userId, hasReq: true });
    } else {
      const loc = await getLocationByIp(ip);
      if (!loc) {
        console.warn(LOG, 'IP geolocation returned no coordinates', { userId });
      } else {
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
        console.log(LOG, 'stored coords from IP lookup', {
          userId,
          lat: Math.round(latitude * 100) / 100,
          lon: Math.round(longitude * 100) / 100,
        });
      }
    }
  } else if (latitude == null || longitude == null) {
    console.warn(LOG, 'missing coords and no request for IP lookup', { userId });
  }

  let cityId: string | null = null;
  if (latitude != null && longitude != null) {
    console.log(LOG, 'resolving nearest city', {
      userId,
      hadStoredIpCoords,
      lat: Math.round(latitude * 100) / 100,
      lon: Math.round(longitude * 100) / 100,
    });
    cityId = await getNearestCityIdByCoords(latitude, longitude);
  } else {
    console.warn(LOG, 'no lat/lon for nearest-city step', { userId });
  }

  if (!cityId && config.fallbackCityId) {
    console.log(LOG, 'using FALLBACK_CITY_ID', { userId, fallbackCityId: config.fallbackCityId });
    cityId = config.fallbackCityId;
  }

  if (!cityId) {
    console.warn(LOG, 'auth.cityAutoDetectFailed: no cityId (no nearest match, no valid fallback)', {
      userId,
      hasFallbackEnv: Boolean(config.fallbackCityId),
      hadCoords: latitude != null && longitude != null,
    });
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
    console.warn(LOG, 'auth.cityAutoDetectFailed: cityId not isCorrect+isActive', { userId, cityId });
    throw new ApiError(409, 'auth.cityAutoDetectFailed');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { currentCityId: city.id },
    select: PROFILE_SELECT_FIELDS,
  });

  await CityGroupService.ensureCityGroupExists(city.id);
  await CityGroupService.addUserToCityGroup(userId, city.id, { mute: true, pin: true });

  console.log(LOG, 'assigned currentCityId', { userId, currentCityId: city.id });

  return user;
}

