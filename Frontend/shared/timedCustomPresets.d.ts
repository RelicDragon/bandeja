import { type Sport } from './sport';
export declare const OPEN_ENDED_SCORING_PRESETS: readonly ["TIMED", "CUSTOM"];
export type OpenEndedScoringPreset = (typeof OPEN_ENDED_SCORING_PRESETS)[number];
export declare function isOpenEndedScoringPreset(preset: string | null | undefined): preset is OpenEndedScoringPreset;
export declare const TIMED_CUSTOM_CREATE_BY_SPORT: Record<Sport, {
    timed: boolean;
    custom: boolean;
}>;
export declare const TIMED_CUSTOM_WEAK_LIVE_SPORTS: ReadonlySet<Sport>;
export declare function timedCustomCreateAllowed(sport: Sport, preset: string): boolean;
export declare function isWeakTimedCustomLive(sport: Sport, preset: string | null | undefined): boolean;
export declare function supportsTimedOpenEndedRallyFreeze(preset: string | null | undefined, totalPointsPerSet: number): boolean;
export declare function registryAllowsOpenEndedPreset(allowedScoringPresets: readonly string[], sport: Sport): boolean;
//# sourceMappingURL=timedCustomPresets.d.ts.map