export type LocationTimeSaveStep = 'gameFields' | 'bookings' | 'snapshots' | 'courts';

export class LocationTimePartialSaveError extends Error {
  readonly failedStep: LocationTimeSaveStep;

  readonly completedSteps: LocationTimeSaveStep[];

  constructor(failedStep: LocationTimeSaveStep, completedSteps: LocationTimeSaveStep[], cause: unknown) {
    super('LocationTimePartialSaveError', { cause });
    this.name = 'LocationTimePartialSaveError';
    this.failedStep = failedStep;
    this.completedSteps = completedSteps;
  }
}

export function isLocationTimePartialSaveError(err: unknown): err is LocationTimePartialSaveError {
  return err instanceof LocationTimePartialSaveError;
}
