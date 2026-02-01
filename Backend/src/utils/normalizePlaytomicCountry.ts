const COUNTRY_MAP: Record<string, { country: string; country_code: string }> = {
  Alemania: { country: 'Germany', country_code: 'DE' },
  Alimania: { country: 'Germany', country_code: 'DE' },
  Danmark: { country: 'Denmark', country_code: 'DK' },
  España: { country: 'Spain', country_code: 'ES' },
  Italia: { country: 'Italy', country_code: 'IT' },
  România: { country: 'Romania', country_code: 'RO' },
  Suiza: { country: 'Switzerland', country_code: 'CH' },
  Ελλάδα: { country: 'Greece', country_code: 'GR' },
  Κύπρος: { country: 'Cyprus', country_code: 'CY' },
  Кипр: { country: 'Cyprus', country_code: 'CY' },
};

export function normalizeCountry(
  rawCountry: string,
  rawCode?: string | null
): { country: string; country_code: string } {
  const trimmed = (rawCountry ?? '').trim();
  const entry = COUNTRY_MAP[trimmed];
  if (entry) return entry;
  const code = (rawCode ?? '').trim().toUpperCase();
  return {
    country: (trimmed || rawCountry) ?? '',
    country_code: code.length === 2 ? code : '',
  };
}
