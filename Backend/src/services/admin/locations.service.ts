import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { COUNTRIES, TIMEZONES, DEFAULT_TIMEZONE } from '../../utils/constants';

export class AdminLocationsService {
  static async getAllCities() {
    const cities = await prisma.city.findMany({
      include: {
        _count: {
          select: {
            clubs: true,
            users: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return cities;
  }

  static async createCity(data: {
    name: string;
    country: string;
    timezone?: string;
    isActive?: boolean;
  }) {
    const { name, country, timezone, isActive } = data;

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
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return city;
  }

  static async updateCity(cityId: string, data: {
    name?: string;
    country?: string;
    timezone?: string;
    isActive?: boolean;
  }) {
    const { name, country, timezone, isActive } = data;

    const existingCity = await prisma.city.findUnique({
      where: { id: cityId },
    });

    if (!existingCity) {
      throw new ApiError(404, 'City not found');
    }

    if (country && !COUNTRIES.includes(country)) {
      throw new ApiError(400, 'Invalid country. Please select from the available countries list');
    }

    if (timezone && !TIMEZONES.includes(timezone)) {
      throw new ApiError(400, 'Invalid timezone. Please select from the available timezones list');
    }

    const city = await prisma.city.update({
      where: { id: cityId },
      data: {
        ...(name && { name }),
        ...(country && { country }),
        ...(timezone && { timezone }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return city;
  }

  static async deleteCity(cityId: string) {
    await prisma.city.delete({
      where: { id: cityId },
    });

    return { message: 'City deleted successfully' };
  }

  static async getAllClubs(cityId?: string) {
    const centers = await prisma.club.findMany({
      where: cityId ? { cityId: cityId } : undefined,
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            courts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return centers;
  }

  static async createClub(data: {
    name: string;
    description?: string;
    address: string;
    cityId: string;
    phone?: string;
    email?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    openingTime?: string;
    closingTime?: string;
    amenities?: string[];
    isActive?: boolean;
    isBar?: boolean;
    isForPlaying?: boolean;
  }) {
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
      isActive,
      isBar,
      isForPlaying,
    } = data;

    const center = await prisma.club.create({
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
        isActive: isActive !== undefined ? isActive : true,
        isBar: isBar || false,
        isForPlaying: isForPlaying !== undefined ? isForPlaying : true,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return center;
  }

  static async updateClub(centerId: string, data: {
    name?: string;
    description?: string;
    address?: string;
    cityId?: string;
    phone?: string;
    email?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    openingTime?: string;
    closingTime?: string;
    amenities?: string[];
    isActive?: boolean;
    isBar?: boolean;
    isForPlaying?: boolean;
  }) {
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
      isActive,
    } = data;

    const center = await prisma.club.update({
      where: { id: centerId },
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
        isActive,
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return center;
  }

  static async deleteClub(centerId: string) {
    await prisma.club.delete({
      where: { id: centerId },
    });

    return { message: 'Padel center deleted successfully' };
  }

  static async getAllCourts(centerId?: string) {
    const where = centerId ? { clubId: centerId } : {};

    const courts = await prisma.court.findMany({
      where,
      include: {
        club: {
          include: {
            city: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return courts;
  }

  static async createCourt(data: {
    name: string;
    clubId: string;
    courtType?: string;
    isIndoor?: boolean;
    surfaceType?: string;
    pricePerHour?: number;
    isActive?: boolean;
  }) {
    const {
      name,
      clubId,
      courtType,
      isIndoor,
      surfaceType,
      pricePerHour,
      isActive,
    } = data;

    const court = await prisma.court.create({
      data: {
        name,
        clubId,
        courtType,
        isIndoor: isIndoor !== undefined ? isIndoor : false,
        surfaceType,
        pricePerHour,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: {
        club: {
          include: {
            city: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return court;
  }

  static async updateCourt(courtId: string, data: {
    name?: string;
    clubId?: string;
    courtType?: string;
    isIndoor?: boolean;
    surfaceType?: string;
    pricePerHour?: number;
    isActive?: boolean;
  }) {
    const {
      name,
      clubId,
      courtType,
      isIndoor,
      surfaceType,
      pricePerHour,
      isActive,
    } = data;

    const court = await prisma.court.update({
      where: { id: courtId },
      data: {
        name,
        clubId,
        courtType,
        isIndoor,
        surfaceType,
        pricePerHour,
        isActive,
      },
      include: {
        club: {
          include: {
            city: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return court;
  }

  static async deleteCourt(courtId: string) {
    await prisma.court.delete({
      where: { id: courtId },
    });

    return { message: 'Court deleted successfully' };
  }
}
