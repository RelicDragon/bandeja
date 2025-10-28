import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';

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

  res.status(201).json({
    success: true,
    data: club,
  });
});

export const updateClub = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const club = await prisma.club.update({
    where: { id },
    data: updateData,
  });

  res.json({
    success: true,
    data: club,
  });
});


