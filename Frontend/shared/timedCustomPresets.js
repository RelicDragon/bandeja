"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMED_CUSTOM_WEAK_LIVE_SPORTS = exports.TIMED_CUSTOM_CREATE_BY_SPORT = exports.OPEN_ENDED_SCORING_PRESETS = void 0;
exports.isOpenEndedScoringPreset = isOpenEndedScoringPreset;
exports.timedCustomCreateAllowed = timedCustomCreateAllowed;
exports.isWeakTimedCustomLive = isWeakTimedCustomLive;
exports.supportsTimedOpenEndedRallyFreeze = supportsTimedOpenEndedRallyFreeze;
exports.registryAllowsOpenEndedPreset = registryAllowsOpenEndedPreset;
const sport_1 = require("./sport");
exports.OPEN_ENDED_SCORING_PRESETS = ['TIMED', 'CUSTOM'];
function isOpenEndedScoringPreset(preset) {
    return preset === 'TIMED' || preset === 'CUSTOM';
}
exports.TIMED_CUSTOM_CREATE_BY_SPORT = {
    [sport_1.Sports.PADEL]: { timed: true, custom: true },
    [sport_1.Sports.TENNIS]: { timed: true, custom: true },
    [sport_1.Sports.PICKLEBALL]: { timed: false, custom: true },
    [sport_1.Sports.BADMINTON]: { timed: false, custom: true },
    [sport_1.Sports.TABLE_TENNIS]: { timed: false, custom: true },
    [sport_1.Sports.SQUASH]: { timed: false, custom: true },
};
exports.TIMED_CUSTOM_WEAK_LIVE_SPORTS = new Set([sport_1.Sports.PICKLEBALL]);
function timedCustomCreateAllowed(sport, preset) {
    const policy = exports.TIMED_CUSTOM_CREATE_BY_SPORT[sport];
    if (preset === 'TIMED')
        return policy.timed;
    if (preset === 'CUSTOM')
        return policy.custom;
    return true;
}
function isWeakTimedCustomLive(sport, preset) {
    return exports.TIMED_CUSTOM_WEAK_LIVE_SPORTS.has(sport) && isOpenEndedScoringPreset(preset);
}
function supportsTimedOpenEndedRallyFreeze(preset, totalPointsPerSet) {
    return isOpenEndedScoringPreset(preset) && totalPointsPerSet <= 0;
}
function registryAllowsOpenEndedPreset(allowedScoringPresets, sport) {
    const policy = exports.TIMED_CUSTOM_CREATE_BY_SPORT[sport];
    if (policy.timed && !allowedScoringPresets.includes('TIMED'))
        return false;
    if (policy.custom && !allowedScoringPresets.includes('CUSTOM'))
        return false;
    if (!policy.timed && allowedScoringPresets.includes('TIMED'))
        return false;
    if (!policy.custom && allowedScoringPresets.includes('CUSTOM'))
        return false;
    return true;
}
//# sourceMappingURL=timedCustomPresets.js.map