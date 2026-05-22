export declare const Sports: {
    readonly PADEL: "PADEL";
    readonly TENNIS: "TENNIS";
    readonly PICKLEBALL: "PICKLEBALL";
    readonly BADMINTON: "BADMINTON";
    readonly TABLE_TENNIS: "TABLE_TENNIS";
    readonly SQUASH: "SQUASH";
};
export type Sport = (typeof Sports)[keyof typeof Sports];
export declare const ALL_SPORTS: readonly Sport[];
export declare const DEFAULT_SPORT: Sport;
export declare function isSport(value: unknown): value is Sport;
export declare function parseSport(value: unknown, fallback?: Sport): Sport;
//# sourceMappingURL=sport.d.ts.map