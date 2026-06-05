import { AdCampaignStatus, AdPlacementKey, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AdCampaignCache } from '../ads/ad.cache';
import {
  adCampaignPatchSchema,
  adCampaignWriteSchema,
  DEFAULT_FREQUENCY_CAP,
  type FrequencyCap,
} from '../ads/ad.schemas';

function toFrequencyCapInput(
  value: FrequencyCap | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return DEFAULT_FREQUENCY_CAP;
  if (value === null) return Prisma.JsonNull;
  return value;
}

function stripFrequencyCap<T extends { frequencyCap?: FrequencyCap }>(
  data: T
): Omit<T, 'frequencyCap'> & { frequencyCap?: Prisma.InputJsonValue | typeof Prisma.JsonNull } {
  const { frequencyCap, ...rest } = data;
  if (frequencyCap === undefined) return rest;
  return { ...rest, frequencyCap: toFrequencyCapInput(frequencyCap) };
}

function invalidateCache() {
  AdCampaignCache.clearCache();
}

export class AdminAdCampaignService {
  static async list(sponsorId?: string) {
    return prisma.adCampaign.findMany({
      where: sponsorId ? { sponsorId } : undefined,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { name: 'asc' }],
      include: {
        sponsor: { select: { id: true, name: true } },
        placements: true,
        _count: { select: { creatives: true, events: true } },
      },
    });
  }

  static async getById(id: string) {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id },
      include: {
        sponsor: true,
        creatives: true,
        placements: true,
      },
    });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    return campaign;
  }

  static async create(body: unknown) {
    const parsed = adCampaignWriteSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    const sponsor = await prisma.adSponsor.findUnique({ where: { id: parsed.data.sponsorId } });
    if (!sponsor) throw new ApiError(400, 'Sponsor not found');

    const { placements, ...data } = parsed.data;

    const campaign = await prisma.adCampaign.create({
      data: {
        ...data,
        frequencyCap: toFrequencyCapInput(data.frequencyCap),
        placements: {
          create: placements.map((placement) => ({ placement: placement as AdPlacementKey })),
        },
      },
      include: { placements: true, creatives: true, sponsor: true },
    });

    invalidateCache();
    return campaign;
  }

  static async update(id: string, body: unknown) {
    const existing = await prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Campaign not found');

    const parsed = adCampaignPatchSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    const { placements, ...data } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.adCampaign.update({ where: { id }, data: stripFrequencyCap(data) });

      if (placements) {
        await tx.adCampaignPlacement.deleteMany({ where: { campaignId: id } });
        await tx.adCampaignPlacement.createMany({
          data: placements.map((placement) => ({
            campaignId: id,
            placement: placement as AdPlacementKey,
          })),
        });
      }
    });

    invalidateCache();
    return this.getById(id);
  }

  static async delete(id: string) {
    const existing = await prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Campaign not found');
    await prisma.adCampaign.delete({ where: { id } });
    invalidateCache();
    return { message: 'Campaign deleted' };
  }

  static async setStatus(id: string, status: AdCampaignStatus) {
    const existing = await prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Campaign not found');

    const updated = await prisma.adCampaign.update({
      where: { id },
      data: { status },
    });
    invalidateCache();
    return updated;
  }
}
