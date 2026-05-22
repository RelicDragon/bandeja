"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SPORT = exports.ALL_SPORTS = exports.Sports = void 0;
exports.isSport = isSport;
exports.parseSport = parseSport;
exports.Sports = {
    PADEL: 'PADEL',
    TENNIS: 'TENNIS',
    PICKLEBALL: 'PICKLEBALL',
    BADMINTON: 'BADMINTON',
    TABLE_TENNIS: 'TABLE_TENNIS',
    SQUASH: 'SQUASH',
};
exports.ALL_SPORTS = Object.values(exports.Sports);
exports.DEFAULT_SPORT = exports.Sports.PADEL;
function isSport(value) {
    return typeof value === 'string' && exports.ALL_SPORTS.includes(value);
}
function parseSport(value, fallback = exports.DEFAULT_SPORT) {
    return isSport(value) ? value : fallback;
}
//# sourceMappingURL=sport.js.map