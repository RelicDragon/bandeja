import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  AdTargeting,
  adTargetingPresetTemplateSchema,
  adTargetingPresetWriteSchema,
  adTargetingSchema,
} from '../ads/ad.schemas';

async function resolveCityNames(cityNames: string[] | undefined): Promise<string[]> {
  if (!cityNames || cityNames.length === 0) return [];
  const cities = await prisma.city.findMany({
    where: { name: { in: cityNames, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  return cities.map((c) => c.id);
}

export async function resolvePresetTargeting(
  template: Record<string, unknown>
): Promise<AdTargeting> {
  const parsed = adTargetingPresetTemplateSchema.safeParse(template);
  if (!parsed.success) throw new ApiError(400, parsed.error.message);

  const { cityNames, allCities, ...rest } = parsed.data;
  let cityIds = [...rest.cityIds];
  if (allCities) {
    const all = await prisma.city.findMany({ select: { id: true } });
    cityIds = [...new Set([...cityIds, ...all.map((c) => c.id)])];
  } else {
    const resolvedCityIds = await resolveCityNames(cityNames);
    cityIds = [...new Set([...cityIds, ...resolvedCityIds])];
  }

  if (cityIds.length === 0) {
    throw new ApiError(400, 'Preset must resolve at least one city (cityIds, cityNames, or allCities)');
  }

  const targeting = adTargetingSchema.parse({ ...rest, cityIds });
  return targeting;
}

export class AdminAdTargetingPresetService {
  static async list() {
    await this.ensureDefaultPresets();
    return prisma.adTargetingPreset.findMany({
      orderBy: { name: 'asc' },
    });
  }

  static async getById(id: string) {
    const preset = await prisma.adTargetingPreset.findUnique({ where: { id } });
    if (!preset) throw new ApiError(404, 'Targeting preset not found');
    return preset;
  }

  static async create(body: unknown) {
    const parsed = adTargetingPresetWriteSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    return prisma.adTargetingPreset.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        targeting: parsed.data.targeting,
      },
    });
  }

  static async delete(id: string) {
    await this.getById(id);
    await prisma.adTargetingPreset.delete({ where: { id } });
    return { id };
  }

  static async apply(id: string): Promise<AdTargeting> {
    const preset = await this.getById(id);
    return resolvePresetTargeting(preset.targeting as Record<string, unknown>);
  }

  static async applyToCampaign(presetId: string, campaignId: string) {
    const targeting = await this.apply(presetId);
    const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    const { AdCampaignCache } = await import('../ads/ad.cache');
    const updated = await prisma.adCampaign.update({
      where: { id: campaignId },
      data: { targeting },
    });
    AdCampaignCache.clearCache();
    return updated;
  }

  static async ensureDefaultPresets() {
    const existing = await prisma.adTargetingPreset.findUnique({
      where: { name: 'Belgrade padel 3+' },
    });
    if (existing) return;

    await prisma.adTargetingPreset.create({
      data: {
        name: 'Belgrade padel 3+',
        description: 'Padel players level 3.0+ in Belgrade',
        targeting: {
          cityNames: ['Belgrade'],
          cityIds: [],
          sports: ['PADEL'],
          levelBands: [{ min: 3.0, max: 7.0 }],
        },
      },
    });
  }
}
