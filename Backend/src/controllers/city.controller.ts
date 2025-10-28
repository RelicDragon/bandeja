import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { COUNTRIES, TIMEZONES, DEFAULT_TIMEZONE } from '../utils/constants';

export const getAllCities = asyncHandler(async (req: Request, res: Response) => {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      country: true,
      timezone: true,
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: cities,
  });
});

export const getCityById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const city = await prisma.city.findUnique({
    where: { id },
    include: {
      clubs: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });

  if (!city) {
    throw new ApiError(404, 'City not found');
  }

  res.json({
    success: true,
    data: city,
  });
});

export const getCountries = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: COUNTRIES,
  });
});

export const getTimezones = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: TIMEZONES,
    default: DEFAULT_TIMEZONE,
  });
});

export const createCity = asyncHandler(async (req: Request, res: Response) => {
  const { name, country, timezone } = req.body;

  if (!name) {
    throw new ApiError(400, 'City name is required');
  }

  if (!country) {
    throw new ApiError(400, 'Country is required');
  }

  if (!COUNTRIES.includes(country)) {
    throw new ApiError(400, 'Invalid country. Please select from the available countries list');
  }

  const cityTimezone = timezone || DEFAULT_TIMEZONE;

  if (!TIMEZONES.includes(cityTimezone)) {
    throw new ApiError(400, 'Invalid timezone. Please select from the available timezones list');
  }

  const city = await prisma.city.create({
    data: {
      name,
      country,
      timezone: cityTimezone,
    },
  });

  res.status(201).json({
    success: true,
    data: city,
  });
});

