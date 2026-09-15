import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { sanitizeUtmValue } from './linkToApp.urls';
import { sanitizeCampaignLabel } from './linkToApp.campaignLabelParse';

export { displayCampaignName, sanitizeCampaignLabel } from './linkToApp.campaignLabelParse';

export async function listLinkToAppCampaignLabels() {
  return prisma.linkToAppCampaignLabel.findMany({
    orderBy: [{ label: 'asc' }, { utmCampaign: 'asc' }],
  });
}

export async function campaignLabelMap(campaigns?: Array<string | null | undefined>): Promise<Map<string, string>> {
  const wanted = [...new Set((campaigns ?? []).filter((value): value is string => Boolean(value)))];
  const rows = wanted.length
    ? await prisma.linkToAppCampaignLabel.findMany({
        where: { utmCampaign: { in: wanted } },
        select: { utmCampaign: true, label: true },
      })
    : await prisma.linkToAppCampaignLabel.findMany({
        select: { utmCampaign: true, label: true },
      });
  return new Map(rows.map((row) => [row.utmCampaign, row.label]));
}

export async function upsertLinkToAppCampaignLabel(utmCampaignRaw: unknown, labelRaw: unknown) {
  const utmCampaign = sanitizeUtmValue(utmCampaignRaw);
  const label = sanitizeCampaignLabel(labelRaw);
  if (!utmCampaign) {
    throw new ApiError(400, 'Campaign code is required', true, { code: 'linkToApp.invalidCampaign' });
  }
  if (!label) {
    throw new ApiError(400, 'Visual name is required', true, { code: 'linkToApp.invalidCampaignLabel' });
  }
  return prisma.linkToAppCampaignLabel.upsert({
    where: { utmCampaign },
    create: { utmCampaign, label },
    update: { label },
  });
}

export async function deleteLinkToAppCampaignLabel(utmCampaignRaw: unknown) {
  const utmCampaign = sanitizeUtmValue(utmCampaignRaw);
  if (!utmCampaign) {
    throw new ApiError(400, 'Campaign code is required', true, { code: 'linkToApp.invalidCampaign' });
  }
  try {
    await prisma.linkToAppCampaignLabel.delete({ where: { utmCampaign } });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'P2025') {
      throw new ApiError(404, 'Campaign label not found', true, { code: 'linkToApp.campaignLabelNotFound' });
    }
    throw error;
  }
}
