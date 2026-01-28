import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { COUNTRIES, TIMEZONES, DEFAULT_TIMEZONE } from '../../utils/constants';
import { normalizeClubName } from '../../utils/normalizeClubName';
import { refreshCityFromClubs, refreshAllCitiesFromClubs } from '../../utils/updateCityCenter';

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
    telegramGroupId?: string | null;
    isActive?: boolean;
    subAdministrativeArea?: string | null;
    administrativeArea?: string | null;
  }) {
    const { name, country, timezone, telegramGroupId, isActive, subAdministrativeArea, administrativeArea } = data;

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
        telegramGroupId: telegramGroupId ?? null,
        isActive: isActive !== undefined ? isActive : true,
        subAdministrativeArea: subAdministrativeArea ?? null,
        administrativeArea: administrativeArea ?? null,
      },
    });
    await refreshCityFromClubs(city.id);
    return city;
  }

  static async updateCity(cityId: string, data: {
    name?: string;
    country?: string;
    timezone?: string;
    telegramGroupId?: string | null;
    isActive?: boolean;
    subAdministrativeArea?: string | null;
    administrativeArea?: string | null;
  }) {
    const { name, country, timezone, telegramGroupId, isActive, subAdministrativeArea, administrativeArea } = data;

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
        ...(telegramGroupId !== undefined && { telegramGroupId }),
        ...(isActive !== undefined && { isActive }),
        ...(subAdministrativeArea !== undefined && { subAdministrativeArea }),
        ...(administrativeArea !== undefined && { administrativeArea }),
      },
    });
    await refreshCityFromClubs(cityId);
    return city;
  }

  static async deleteCity(cityId: string) {
    await prisma.city.delete({
      where: { id: cityId },
    });

    return { message: 'City deleted successfully' };
  }

  static async recalculateCityCenter(cityId: string) {
    const city = await prisma.city.findUnique({ where: { id: cityId } });
    if (!city) throw new ApiError(404, 'City not found');
    await refreshCityFromClubs(cityId);
    return prisma.city.findUnique({ where: { id: cityId } });
  }

  static async recalculateAllCitiesCenter() {
    const count = await refreshAllCitiesFromClubs();
    return { updated: count };
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

    const active = isActive !== undefined ? isActive : true;
    const center = await prisma.club.create({
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
        isActive: active,
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
    await refreshCityFromClubs(cityId);
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

    const oldClub = await prisma.club.findUnique({
      where: { id: centerId },
      select: { cityId: true, isActive: true },
    });
    if (!oldClub) throw new ApiError(404, 'Club not found');
    const dataPayload: Parameters<typeof prisma.club.update>[0]['data'] = {
      ...(name != null && { name, normalizedName: normalizeClubName(name) }),
      ...(description !== undefined && { description }),
      ...(address !== undefined && { address }),
      ...(cityId !== undefined && { cityId }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(website !== undefined && { website }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(openingTime !== undefined && { openingTime }),
      ...(closingTime !== undefined && { closingTime }),
      ...(amenities !== undefined && { amenities }),
      ...(isActive !== undefined && { isActive }),
    };
    const center = await prisma.club.update({
      where: { id: centerId },
      data: dataPayload,
      include: {
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const newCityId = center.cityId;
    if (oldClub.cityId !== newCityId) {
      await refreshCityFromClubs(oldClub.cityId);
      await refreshCityFromClubs(newCityId);
    } else {
      await refreshCityFromClubs(newCityId);
    }
    return center;
  }

  static async deleteClub(centerId: string) {
    const club = await prisma.club.findUnique({
      where: { id: centerId },
      select: { cityId: true },
    });
    await prisma.club.delete({
      where: { id: centerId },
    });
    if (club) await refreshCityFromClubs(club.cityId);
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
