const LABEL_MAX = 80;

export function sanitizeCampaignLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value || value.length > LABEL_MAX) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

export function displayCampaignName(utmCampaign: string | null | undefined, label: string | null | undefined): string {
  const code = utmCampaign?.trim() || '';
  const named = label?.trim() || '';
  if (named) return named;
  return code || '—';
}
