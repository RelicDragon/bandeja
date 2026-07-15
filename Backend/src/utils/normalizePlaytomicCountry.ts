const COUNTRY_MAP: Record<string, { country: string; country_code: string }> = {
  Alemania: { country: 'Germany', country_code: 'DE' },
  Alimania: { country: 'Germany', country_code: 'DE' },
  Danmark: { country: 'Denmark', country_code: 'DK' },
  España: { country: 'Spain', country_code: 'ES' },
  Espana: { country: 'Spain', country_code: 'ES' },
  Espagne: { country: 'Spain', country_code: 'ES' },
  Espanha: { country: 'Spain', country_code: 'ES' },
  Espanya: { country: 'Spain', country_code: 'ES' },
  Spagna: { country: 'Spain', country_code: 'ES' },
  Österreich: { country: 'Austria', country_code: 'AT' },
  Osterreich: { country: 'Austria', country_code: 'AT' },
  Autriche: { country: 'Austria', country_code: 'AT' },
  Austria: { country: 'Austria', country_code: 'AT' },
  Poland: { country: 'Poland', country_code: 'PL' },
  Polonia: { country: 'Poland', country_code: 'PL' },
  Polska: { country: 'Poland', country_code: 'PL' },
  Pologne: { country: 'Poland', country_code: 'PL' },
  Italia: { country: 'Italy', country_code: 'IT' },
  România: { country: 'Romania', country_code: 'RO' },
  Suiza: { country: 'Switzerland', country_code: 'CH' },
  Ελλάδα: { country: 'Greece', country_code: 'GR' },
  Κύπρος: { country: 'Cyprus', country_code: 'CY' },
  Кипр: { country: 'Cyprus', country_code: 'CY' },
  Lituania: { country: 'Lithuania', country_code: 'LT' },
  Lietuva: { country: 'Lithuania', country_code: 'LT' },
  Litauen: { country: 'Lithuania', country_code: 'LT' },
  Lithuania: { country: 'Lithuania', country_code: 'LT' },
  Letonia: { country: 'Latvia', country_code: 'LV' },
  Latvija: { country: 'Latvia', country_code: 'LV' },
  Lettland: { country: 'Latvia', country_code: 'LV' },
  Latvia: { country: 'Latvia', country_code: 'LV' },
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
