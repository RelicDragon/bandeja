/**
 * Swiss / box-league pairing for table tennis and similar sports.
 * Uses the same round engine as ladder (ESCALERA) — skill-based court movement.
 * A dedicated MatchGenerationType may be added later; until then use ESCALERA + gameType LADDER.
 */
export { generateEscaleraRound as generateSwissPairingRound } from './escalera';
