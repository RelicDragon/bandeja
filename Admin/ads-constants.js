/** @typedef {'home_hero'|'find_top'|'leaderboard_banner'} AdPlacementKey */
/** @typedef {'DRAFT'|'SCHEDULED'|'ACTIVE'|'PAUSED'|'ENDED'} AdCampaignStatus */
/** @typedef {'OPEN_URL'|'IN_APP_ROUTE'|'CLUB_PAGE'|'MARKET_ITEM'} AdClickAction */

/** @typedef {Object} AdFrequencyCap
 * @property {number} maxImpressions
 * @property {number} windowDays
 */

/** @typedef {Object} AdLevelBand
 * @property {string} sport
 * @property {number} min
 * @property {number} max
 */

/** @typedef {Object} AdTargeting
 * @property {string[]} cityIds
 * @property {string[]} [sports]
 * @property {string[]} [languages]
 * @property {AdLevelBand[]} [levelBands]
 * @property {number} [rolloutPercent]
 * @property {string[]} [includeUserIds]
 * @property {string[]} [excludeUserIds]
 */

/** @typedef {Object} AdSegmentPreset
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [builtin]
 * @property {AdTargeting} targeting
 * @property {string[]} [cityNames]
 */

/** @typedef {Object} AdSponsor
 * @property {string} id
 * @property {string} name
 * @property {string|null} contactEmail
 * @property {string|null} notes
 * @property {string|null} clubId
 * @property {string} createdAt
 * @property {number} [campaignCount]
 */

/** @typedef {Object} AdCreative
 * @property {string} id
 * @property {string} campaignId
 * @property {AdPlacementKey|null} placement
 * @property {string} locale
 * @property {string} variantKey
 * @property {string} imageUrl
 * @property {string|null} imageUrlDark
 * @property {string|null} title
 * @property {string|null} subtitle
 * @property {string|null} ctaLabel
 * @property {string} clickUrl
 * @property {AdClickAction} clickAction
 */

/** @typedef {Object} AdCampaign
 * @property {string} id
 * @property {string} sponsorId
 * @property {string} name
 * @property {AdCampaignStatus} status
 * @property {number} priority
 * @property {number} weight
 * @property {string|null} startsAt
 * @property {string|null} endsAt
 * @property {string} defaultLocale
 * @property {AdFrequencyCap|null} frequencyCap
 * @property {boolean} dismissible
 * @property {number|null} dismissSnoozeDays
 * @property {boolean} clickUrlTrusted
 * @property {string|null} disclosureLabel
 * @property {boolean} hideDisclosure
 * @property {AdTargeting} targeting
 * @property {string[]} testUserIds
 * @property {AdPlacementKey[]} placements
 * @property {AdCreative[]} [creatives]
 * @property {AdSponsor} [sponsor]
 * @property {string} createdAt
 * @property {string} [updatedAt]
 */

/** @typedef {Object} AdStatsRow
 * @property {string} [date]
 * @property {AdPlacementKey} [placement]
 * @property {string|null} [cityId]
 * @property {string|null} [locale]
 * @property {number} impressions
 * @property {number} uniqueUsers
 * @property {number} clicks
 * @property {number} dismisses
 */

/** @typedef {Object} AdStatsSummary
 * @property {number} impressions
 * @property {number} uniqueUsers
 * @property {number} clicks
 * @property {number} dismisses
 * @property {number} [ctr]
 * @property {number} [dismissRate]
 * @property {AdStatsRow[]} [breakdown]
 */

const AD_PLACEMENTS = [
    { key: 'home_hero', label: 'Home Hero' },
    { key: 'find_top', label: 'Find Top' },
    { key: 'leaderboard_banner', label: 'Leaderboard Banner' },
];

const AD_LOCALES = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Russian' },
    { code: 'es', label: 'Spanish' },
    { code: 'sr', label: 'Serbian' },
    { code: 'cs', label: 'Czech' },
];

const AD_CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED'];

const AD_CLICK_ACTIONS = [
    { value: 'OPEN_URL', label: 'Open URL' },
    { value: 'IN_APP_ROUTE', label: 'In-app route' },
    { value: 'CLUB_PAGE', label: 'Club page' },
    { value: 'MARKET_ITEM', label: 'Market item' },
];

const AD_DEFAULT_FREQUENCY_CAP = { maxImpressions: 3, windowDays: 7 };

const AD_VARIANT_KEYS = ['A', 'B', 'C', 'D'];

const AD_LEVEL_BANDS = [
    { key: 'beginner', min: 1.0, max: 2.0, label: '1.0–2.0 Beginner' },
    { key: 'improver', min: 2.0, max: 3.0, label: '2.0–3.0 Improver' },
    { key: 'intermediate', min: 3.0, max: 4.0, label: '3.0–4.0 Intermediate' },
    { key: 'advanced', min: 4.0, max: 5.0, label: '4.0–5.0 Advanced' },
    { key: 'expert', min: 5.0, max: 6.0, label: '5.0–6.0 Expert' },
    { key: 'elite', min: 6.0, max: 7.0, label: '6.0–7.0 Elite' },
];

const AD_BUILTIN_SEGMENT_PRESETS = [
    {
        id: 'builtin-belgrade-padel-3plus',
        name: 'Belgrade padel 3+',
        description: 'Belgrade city, PADEL sport, level 3.0+',
        builtin: true,
        cityNames: ['Belgrade'],
        targeting: {
            cityIds: [],
            sports: ['PADEL'],
            languages: [],
            levelBands: [{ sport: 'PADEL', min: 3.0, max: 7.0 }],
            rolloutPercent: 100,
            includeUserIds: [],
            excludeUserIds: [],
        },
    },
    {
        id: 'builtin-all-padel-intermediate',
        name: 'All cities padel 3–5',
        description: 'Any city, PADEL, intermediate band (3.0–5.0)',
        builtin: true,
        allCities: true,
        targeting: {
            cityIds: [],
            sports: ['PADEL'],
            languages: [],
            levelBands: [
                { sport: 'PADEL', min: 3.0, max: 4.0 },
                { sport: 'PADEL', min: 4.0, max: 5.0 },
            ],
            rolloutPercent: 100,
            includeUserIds: [],
            excludeUserIds: [],
        },
    },
    {
        id: 'builtin-ru-speakers',
        name: 'Russian speakers',
        description: 'Russian locale users, all sports',
        builtin: true,
        allCities: true,
        targeting: {
            cityIds: [],
            sports: [],
            languages: ['ru'],
            levelBands: [],
            rolloutPercent: 100,
            includeUserIds: [],
            excludeUserIds: [],
        },
    },
];

function adPlacementLabel(key) {
    const p = AD_PLACEMENTS.find((x) => x.key === key);
    return p ? p.label : key;
}

function adStatusBadgeClass(status) {
    const map = {
        DRAFT: 'badge-secondary',
        SCHEDULED: 'badge-info',
        ACTIVE: 'badge-success',
        PAUSED: 'badge-warning',
        ENDED: 'badge-danger',
    };
    return map[status] || 'badge-secondary';
}

function adLocaleLabel(code) {
    const l = AD_LOCALES.find((x) => x.code === code);
    return l ? l.label : code;
}

function parseTestUserIds(raw) {
    if (!raw || !String(raw).trim()) return [];
    return String(raw)
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function formatTestUserIds(ids) {
    return (ids || []).join('\n');
}

function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseUserIdList(raw) {
    return parseTestUserIds(raw);
}

function formatUserIdList(ids) {
    return formatTestUserIds(ids);
}

function levelBandKey(band) {
    return `${band.sport}_${band.min}_${band.max}`;
}

function isLevelBandSelected(band, selected) {
    const key = levelBandKey(band);
    return selected.some((b) => levelBandKey(b) === key);
}

function presetUsesAllCities(preset) {
    return !!(preset.allCities || preset.targeting?.allCities);
}

function resolvePresetCityIds(preset, cities) {
    if (presetUsesAllCities(preset)) {
        return cities.map((c) => c.id);
    }
    const names = preset.cityNames || [];
    if (!names.length) return preset.targeting?.cityIds || [];
    const resolved = cities
        .filter((c) => names.some((n) => c.name.toLowerCase() === n.toLowerCase()))
        .map((c) => c.id);
    return resolved.length ? resolved : (preset.targeting?.cityIds || []);
}

function mergePresetTargeting(preset, cities) {
    const t = preset.targeting || {};
    return {
        cityIds: resolvePresetCityIds(preset, cities),
        sports: t.sports || [],
        languages: t.languages || [],
        levelBands: t.levelBands || [],
        rolloutPercent: t.rolloutPercent ?? 100,
        includeUserIds: t.includeUserIds || [],
        excludeUserIds: t.excludeUserIds || [],
        variantWeights: t.variantWeights,
    };
}

function creativeVariantWeight(creative) {
    const meta = creative?.metadata;
    const w = meta?.variantWeight ?? meta?.weight;
    return typeof w === 'number' && w > 0 ? w : 100;
}
