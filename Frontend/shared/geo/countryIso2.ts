/**
 * `City.country` → ISO-3166 alpha-2.
 *
 * The column holds a **display name**, not a code: every row in production
 * reads "Spain", "United Kingdom", "Bosnia and Herzegovina". Anything that
 * needs to reason about the country — the currency guess, PRD 348's
 * country-scoped payment methods — has to go through a name map, and there
 * must be exactly one of those or the two sides quietly disagree about where
 * a game is.
 *
 * A value that is already a 2-letter code is passed through uppercased, so a
 * future migration of the column to real ISO-2 needs no change here.
 */

/** Lower-cased display name (and common alias) → ISO-3166 alpha-2. */
const NAME_TO_ISO2: Record<string, string> = {
  // ── Europe ───────────────────────────────────────────────────────────────
  albania: 'AL',
  andorra: 'AD',
  armenia: 'AM',
  austria: 'AT',
  azerbaijan: 'AZ',
  belarus: 'BY',
  belgium: 'BE',
  'bosnia and herzegovina': 'BA',
  bosnia: 'BA',
  'republika srpska': 'BA',
  bulgaria: 'BG',
  croatia: 'HR',
  hrvatska: 'HR',
  cyprus: 'CY',
  κύπρος: 'CY',
  кипр: 'CY',
  czechia: 'CZ',
  'czech republic': 'CZ',
  česko: 'CZ',
  denmark: 'DK',
  estonia: 'EE',
  'faroe islands': 'FO',
  finland: 'FI',
  france: 'FR',
  georgia: 'GE',
  germany: 'DE',
  gibraltar: 'GI',
  greece: 'GR',
  ελλάδα: 'GR',
  guernsey: 'GG',
  hungary: 'HU',
  iceland: 'IS',
  ireland: 'IE',
  'isle of man': 'IM',
  italy: 'IT',
  jersey: 'JE',
  kosovo: 'XK',
  latvia: 'LV',
  liechtenstein: 'LI',
  lithuania: 'LT',
  luxembourg: 'LU',
  malta: 'MT',
  moldova: 'MD',
  monaco: 'MC',
  montenegro: 'ME',
  'crna gora': 'ME',
  netherlands: 'NL',
  'north macedonia': 'MK',
  macedonia: 'MK',
  norway: 'NO',
  poland: 'PL',
  portugal: 'PT',
  romania: 'RO',
  russia: 'RU',
  'russian federation': 'RU',
  'san marino': 'SM',
  serbia: 'RS',
  srbija: 'RS',
  србија: 'RS',
  сербия: 'RS',
  serbien: 'RS',
  'republic of serbia': 'RS',
  'republika srbija': 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  spain: 'ES',
  españa: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  turkey: 'TR',
  türkiye: 'TR',
  ukraine: 'UA',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'vatican city': 'VA',

  // ── Middle East & Central Asia ───────────────────────────────────────────
  bahrain: 'BH',
  egypt: 'EG',
  iraq: 'IQ',
  israel: 'IL',
  jordan: 'JO',
  kazakhstan: 'KZ',
  kuwait: 'KW',
  kyrgyzstan: 'KG',
  lebanon: 'LB',
  oman: 'OM',
  qatar: 'QA',
  'saudi arabia': 'SA',
  saudi: 'SA',
  ksa: 'SA',
  'united arab emirates': 'AE',
  uae: 'AE',
  emirates: 'AE',
  uzbekistan: 'UZ',

  // ── Asia & Pacific ───────────────────────────────────────────────────────
  australia: 'AU',
  china: 'CN',
  'hong kong': 'HK',
  india: 'IN',
  indonesia: 'ID',
  japan: 'JP',
  malaysia: 'MY',
  'new zealand': 'NZ',
  philippines: 'PH',
  singapore: 'SG',
  'south korea': 'KR',
  korea: 'KR',
  taiwan: 'TW',
  thailand: 'TH',
  vietnam: 'VN',

  // ── Africa ───────────────────────────────────────────────────────────────
  kenya: 'KE',
  morocco: 'MA',
  nigeria: 'NG',
  'south africa': 'ZA',
  tunisia: 'TN',

  // ── Americas ─────────────────────────────────────────────────────────────
  argentina: 'AR',
  bolivia: 'BO',
  brazil: 'BR',
  brasil: 'BR',
  canada: 'CA',
  chile: 'CL',
  colombia: 'CO',
  'costa rica': 'CR',
  'dominican republic': 'DO',
  ecuador: 'EC',
  'el salvador': 'SV',
  guatemala: 'GT',
  guyana: 'GY',
  honduras: 'HN',
  mexico: 'MX',
  méxico: 'MX',
  nicaragua: 'NI',
  panama: 'PA',
  paraguay: 'PY',
  peru: 'PE',
  perú: 'PE',
  'puerto rico': 'PR',
  suriname: 'SR',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  uruguay: 'UY',
  venezuela: 'VE',
};

/**
 * `"Bosnia and Herzegovina"` → `"BA"`, `"RS"` → `"RS"`, `"Atlantis"` →
 * `undefined`.
 *
 * Unknown names answer `undefined` rather than guessing: a caller that cannot
 * place the country should fall back to its neutral behaviour (for PRD 348,
 * the three payment methods that work everywhere), not to a wrong country.
 */
export function resolveCountryIso2(country: string | null | undefined): string | undefined {
  const trimmed = (country ?? '').trim();
  if (!trimmed) return undefined;
  // The name map is consulted first: "UK" is two letters but is an alias for
  // GB, not an ISO code, and passing it through unchanged loses the country.
  const named = NAME_TO_ISO2[trimmed.toLowerCase()];
  if (named) return named;
  return trimmed.length === 2 ? trimmed.toUpperCase() : undefined;
}

/** Every ISO-2 the name map can produce — used by tests to check coverage. */
export function knownCountryIso2s(): readonly string[] {
  return [...new Set(Object.values(NAME_TO_ISO2))].sort();
}
