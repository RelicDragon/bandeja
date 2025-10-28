import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';

export const getCourtsByClub = asyncHandler(async (req: Request, res: Response) => {
  const { clubId } = req.params;

  const courts = await prisma.court.findMany({
    where: {
      clubId,
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: courts,
  });
});

export const getCourtById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const court = await prisma.court.findUnique({
    where: { id },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  });

  if (!court) {
    throw new ApiError(404, 'Court not found');
  }

  res.json({
    success: true,
    data: court,
  });
});

export const createCourt = asyncHandler(async (req: Request, res: Response) => {
  const { name, clubId, courtType, isIndoor, surfaceType, pricePerHour } = req.body;

  const club = await prisma.club.findUnique({
    where: { id: clubId },
  });

  if (!club) {
    throw new ApiError(404, 'Club not found');
  }

  const court = await prisma.court.create({
    data: {
      name,
      clubId,
      courtType,
      isIndoor,
      surfaceType,
      pricePerHour,
    },
  });

  res.status(201).json({
    success: true,
    data: court,
  });
});

export const updateCourt = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const court = await prisma.court.update({
    where: { id },
    data: updateData,
  });

  res.json({
    success: true,
    data: court,
  });
});