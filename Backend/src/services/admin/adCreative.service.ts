import { AdPlacementKey, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AdCampaignCache } from '../ads/ad.cache';
import { adCreativeWriteSchema } from '../ads/ad.schemas';
import { newCreativeId, processAdCreativeImage } from '../ads/ad.media';

function normalizeCreativeUploadBody(body: unknown): Record<string, unknown> {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };

  if (typeof out.metadata === 'string' && out.metadata.trim()) {
    try {
      out.metadata = JSON.parse(out.metadata);
    } catch {
      /* ignore invalid JSON */
    }
  }

  if (out.variantWeight !== undefined && out.variantWeight !== '') {
    const n = Number(out.variantWeight);
    if (!Number.isNaN(n)) out.variantWeight = n;
  }

  const meta = out.metadata as Record<string, unknown> | undefined;
  if (meta && out.variantWeight === undefined) {
    const w = meta.variantWeight ?? meta.weight;
    if (typeof w === 'number' && w > 0) out.variantWeight = w;
  }

  return out;
}

export class AdminAdCreativeService {
  static async upload(
    campaignId: string,
    body: unknown,
    files: { images?: Express.Multer.File[]; imagesDark?: Express.Multer.File[] }
  ) {
    const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    const normalized = normalizeCreativeUploadBody(body);
    const parsed = adCreativeWriteSchema.safeParse(normalized);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    if (!files.images?.length) {
      throw new ApiError(400, 'At least one image file is required');
    }
    if ((files.imagesDark?.length ?? 0) > files.images.length) {
      throw new ApiError(400, 'Dark images cannot outnumber light images');
    }

    const creativeId = newCreativeId();
    const imageUrls = await Promise.all(
      files.images.map((file, index) =>
        processAdCreativeImage(file.buffer, campaignId, creativeId, 'light', index)
      )
    );
    const imageUrlsDark = await Promise.all(
      (files.imagesDark ?? []).map((file, index) =>
        processAdCreativeImage(file.buffer, campaignId, creativeId, 'dark', index)
      )
    );

    // The first frame remains the legacy static image contract for older clients.
    const imageUrl = imageUrls[0];
    const imageUrlDark = imageUrlsDark[0] ?? null;

    const placement = parsed.data.placement as AdPlacementKey | null | undefined;

    const metadata = {
      ...(parsed.data.metadata ?? {}),
      ...(parsed.data.variantWeight !== undefined
        ? { variantWeight: parsed.data.variantWeight }
        : {}),
    };
    const metadataValue = Object.keys(metadata).length > 0 ? metadata : undefined;

    const creativeKey = {
      campaignId,
      placement: placement ?? null,
      locale: parsed.data.locale,
      variantKey: parsed.data.variantKey ?? 'A',
    } as Prisma.AdCreativeCampaignIdPlacementLocaleVariantKeyCompoundUniqueInput;

    const creative = await prisma.adCreative.upsert({
      where: {
        campaignId_placement_locale_variantKey: creativeKey,
      },
      create: {
        id: creativeId,
        campaignId,
        locale: parsed.data.locale,
        placement: placement ?? null,
        variantKey: parsed.data.variantKey ?? 'A',
        imageUrl,
        imageUrlDark,
        imageUrls,
        imageUrlsDark,
        title: parsed.data.title ?? null,
        subtitle: parsed.data.subtitle ?? null,
        ctaLabel: parsed.data.ctaLabel ?? null,
        clickUrl: parsed.data.clickUrl,
        clickAction: parsed.data.clickAction,
        metadata: metadataValue,
      },
      update: {
        imageUrl,
        imageUrlDark,
        imageUrls,
        imageUrlsDark,
        title: parsed.data.title ?? null,
        subtitle: parsed.data.subtitle ?? null,
        ctaLabel: parsed.data.ctaLabel ?? null,
        clickUrl: parsed.data.clickUrl,
        clickAction: parsed.data.clickAction,
        metadata: metadataValue,
      },
    });

    AdCampaignCache.clearCache();
    return creative;
  }

  static async delete(campaignId: string, creativeId: string) {
    const creative = await prisma.adCreative.findFirst({
      where: { id: creativeId, campaignId },
    });
    if (!creative) throw new ApiError(404, 'Creative not found');

    await prisma.adCreative.delete({ where: { id: creativeId } });
    AdCampaignCache.clearCache();
    return { message: 'Creative deleted' };
  }
}
