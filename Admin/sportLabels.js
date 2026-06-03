/** Sync sport list/labels with Backend `src/sport/sportRegistry.ts` + Prisma `Sport` enum. */
const ALL_SPORTS = ['PADEL', 'TENNIS', 'PICKLEBALL', 'BADMINTON', 'TABLE_TENNIS', 'SQUASH'];

const SPORT_LABELS = {
    PADEL: 'Padel',
    TENNIS: 'Tennis',
    PICKLEBALL: 'Pickleball',
    BADMINTON: 'Badminton',
    TABLE_TENNIS: 'Table tennis',
    SQUASH: 'Squash',
};

const PRESET_TIER_LABELS = {
    social: 'Social',
    match: 'Match',
    both: 'Social/Match',
};

function sportLabel(sport) {
    if (!sport) return '—';
    return SPORT_LABELS[sport] || sport;
}

function inferPresetTier(preset) {
    if (!preset) return null;
    if (preset.startsWith('POINTS_') || preset === 'TIMED' || preset === 'PAR_11') return 'social';
    if (preset.startsWith('CLASSIC_') || preset.startsWith('BEST_OF_')) return 'match';
    return 'both';
}

function presetTierLabel(tier) {
    if (!tier) return '';
    return PRESET_TIER_LABELS[tier] || tier;
}

function gamePresetTier(game) {
    if (!game) return null;
    const meta = game.metadata;
    if (meta && typeof meta === 'object' && !Array.isArray(meta) && meta.presetTier) {
        return meta.presetTier;
    }
    if (game.createTemplateId) {
        const id = String(game.createTemplateId).toLowerCase();
        if (id.includes('social')) return 'social';
        if (id.includes('match')) return 'match';
    }
    return inferPresetTier(game.scoringPreset);
}

function presetTierBadgeHtml(tier) {
    if (!tier) return '';
    const cls = tier === 'match' ? 'badge-info' : tier === 'social' ? 'badge-warning' : 'badge-secondary';
    return `<span class="badge ${cls}">${escapeHtml(presetTierLabel(tier))}</span>`;
}

function levelForSport(user, sport) {
    if (!user || !sport) return null;
    const profile = user.sportProfiles?.find((p) => p.sport === sport);
    if (profile?.level != null) return profile.level;
    if (sport === 'PADEL' && user.level != null) return user.level;
    return null;
}

function formatGameFormatDisplay(game) {
    if (!game) return '—';
    const tier = gamePresetTier(game);
    const parts = [];
    if (tier) parts.push(presetTierLabel(tier));
    if (game.scoringPreset) parts.push(String(game.scoringPreset));
    if (game.scoringMode) parts.push(String(game.scoringMode));
    return parts.length ? parts.join(' · ') : '—';
}

function formatGameSummary(game) {
    if (!game) return '—';
    const parts = [sportLabel(game.sport)];
    const tier = gamePresetTier(game);
    if (tier) parts.push(presetTierLabel(tier));
    if (game.scoringPreset) parts.push(String(game.scoringPreset));
    if (game.scoringMode) parts.push(String(game.scoringMode));
    if (game.gameType && game.entityType === 'GAME') parts.push(String(game.gameType));
    return parts.join(' · ');
}

function questionnaireStatusLabel(profile) {
    if (!profile) return '—';
    if (profile.questionnaireCompletedAt) return 'Complete';
    if (profile.questionnaireSkippedAt) return 'Skipped';
    return 'Pending';
}

function formatQuestionnaireSummary(user) {
    const profiles = user?.sportProfiles;
    if (!profiles?.length) return '—';
    const done = profiles.filter(
        (p) => p.questionnaireCompletedAt || p.questionnaireSkippedAt,
    ).length;
    return `${done}/${profiles.length}`;
}

function formatUserSportLevelsSummary(user) {
    const profiles = user?.sportProfiles;
    if (profiles?.length) {
        return profiles.map((p) => `${sportLabel(p.sport)}: ${(p.level ?? 0).toFixed(1)}`).join(', ');
    }
    const primary = user?.primarySport ? sportLabel(user.primarySport) : 'Padel';
    return `${primary}: ${(user?.level ?? 0).toFixed(1)}`;
}

function formatOnlineUserLevel(user) {
    const primary = user?.primarySport || 'PADEL';
    const lv = levelForSport(user, primary);
    if (lv == null) return formatUserSportLevelsSummary(user);
    return `${sportLabel(primary)} ${lv.toFixed(1)}`;
}
