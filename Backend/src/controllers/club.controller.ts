import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { normalizeClubName } from '../utils/normalizeClubName';
import { refreshCityFromClubs } from '../utils/updateCityCenter';

export const getClubsForMap = asyncHandler(async (req: Request, res: Response) => {
  const minLat = req.query.minLat != null ? Number(req.query.minLat) : null;
  const maxLat = req.query.maxLat != null ? Number(req.query.maxLat) : null;
  const minLng = req.query.minLng != null ? Number(req.query.minLng) : null;
  const maxLng = req.query.maxLng != null ? Number(req.query.maxLng) : null;
  const hasBbox =
    minLat != null &&
    maxLat != null &&
    minLng != null &&
    maxLng != null &&
    Number.isFinite(minLat) &&
    Number.isFinite(maxLat) &&
    Number.isFinite(minLng) &&
    Number.isFinite(maxLng);

  const where = {
    isActive: true,
    ...(hasBbox
      ? {
          latitude: { gte: minLat!, lte: maxLat! },
          longitude: { gte: minLng!, lte: maxLng! },
        }
      : {
          latitude: { not: null },
          longitude: { not: null },
        }),
  };

  const clubs = await prisma.club.findMany({
    where,
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      courtsNumber: true,
      city: { select: { id: true, name: true, country: true } },
    },
  });
  const data = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    latitude: c.latitude!,
    longitude: c.longitude!,
    cityId: c.city.id,
    cityName: c.city.name,
    country: c.city.country,
    courtsCount: c.courtsNumber,
  }));
  res.json({ success: true, data });
});

export const getClubsByCity = asyncHandler(async (req: Request, res: Response) => {
  const { cityId } = req.params;
  const { entityType } = req.query;

  const whereClause: any = {
    cityId,
    isActive: true,
  };

  // Filter clubs based on entity type
  if (entityType === 'BAR') {
    whereClause.isBar = true;
  } else if (entityType && entityType !== 'BAR') {
    whereClause.isForPlaying = true;
  }

  const clubs = await prisma.club.findMany({
    where: whereClause,
    include: {
      city: {
        select: {
          id: true,
          name: true,
          timezone: true,
        },
      },
      courts: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          courtType: true,
          isIndoor: true,
          pricePerHour: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: clubs,
  });
});

export const getClubById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      city: {
        select: {
          id: true,
          name: true,
        },
      },
      courts: {
        where: { isActive: true },
      },
    },
  });

  if (!club) {
    throw new ApiError(404, 'Club not found');
  }

  res.json({
    success: true,
    data: club,
  });
});

export const createClub = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    description,
    address,
    cityId,
    phone,
    email,
    website,
    latitude,
    longitude,
    openingTime,
    closingTime,
    amenities,
    isBar,
    isForPlaying,
  } = req.body;

  const city = await prisma.city.findUnique({
    where: { id: cityId },
  });

  if (!city) {
    throw new ApiError(404, 'City not found');
  }

  const club = await prisma.club.create({
    data: {
      name,
      normalizedName: normalizeClubName(name),
      description,
      address,
      cityId,
      phone,
      email,
      website,
      latitude,
      longitude,
      openingTime,
      closingTime,
      amenities,
      isBar: isBar || false,
      isForPlaying: isForPlaying !== undefined ? isForPlaying : true,
    },
  });
  await refreshCityFromClubs(cityId);
  res.status(201).json({
    success: true,
    data: club,
  });
});

export const updateClub = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  if (updateData.name != null) {
    updateData.normalizedName = normalizeClubName(updateData.name);
  }
  const oldClub = await prisma.club.findUnique({
    where: { id },
    select: { cityId: true, isActive: true },
  });
  if (!oldClub) throw new ApiError(404, 'Club not found');
  const club = await prisma.club.update({
    where: { id },
    data: updateData,
  });
  const newCityId = club.cityId;
  if (oldClub.cityId !== newCityId) {
    await refreshCityFromClubs(oldClub.cityId);
    await refreshCityFromClubs(newCityId);
  } else {
    await refreshCityFromClubs(newCityId);
  }
  res.json({
    success: true,
    data: club,
  });
});


