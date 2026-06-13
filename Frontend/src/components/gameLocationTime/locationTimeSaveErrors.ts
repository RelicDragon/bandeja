export type LocationTimeSaveStep = 'gameFields' | 'bookings' | 'snapshots' | 'courts';

export class LocationTimePartialSaveError extends Error {
  readonly failedStep: LocationTimeSaveStep;

  readonly completedSteps: LocationTimeSaveStep[];

  readonly cause: unknown;

  constructor(failedStep: LocationTimeSaveStep, completedSteps: LocationTimeSaveStep[], cause: unknown) {
    super('LocationTimePartialSaveError');
    this.name = 'LocationTimePartialSaveError';
    this.failedStep = failedStep;
    this.completedSteps = completedSteps;
    this.cause = cause;
  }
}

export function isLocationTimePartialSaveError(err: unknown): err is LocationTimePartialSaveError {
  return err instanceof LocationTimePartialSaveError;
}
