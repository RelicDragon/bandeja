export const AD_DISCLOSURE_LABEL_MAX_LEN = 100;

/** A locale-specific creative label overrides the campaign-wide fallback. */
export function resolveAdDisclosureLabel(
  campaignLabel: string | null,
  creativeMetadata: unknown,
): string | null {
  if (
    creativeMetadata &&
    typeof creativeMetadata === 'object' &&
    !Array.isArray(creativeMetadata)
  ) {
    const value = (creativeMetadata as Record<string, unknown>).disclosureLabel;
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, AD_DISCLOSURE_LABEL_MAX_LEN);
    }
  }
  return campaignLabel;
}
