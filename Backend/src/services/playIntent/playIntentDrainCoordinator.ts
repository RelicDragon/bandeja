/**
 * Serializes a queue drain while remembering concurrent drain requests.
 *
 * Every caller awaits the active drain. If work is requested while a pass is
 * running, one more pass is guaranteed before the shared promise resolves.
 */
export class PlayIntentDrainCoordinator {
  private active: Promise<void> | null = null;
  private requested = false;

  run(pass: () => Promise<void>): Promise<void> {
    if (this.active) {
      this.requested = true;
      return this.active;
    }

    this.active = Promise.resolve()
      .then(async () => {
        do {
          this.requested = false;
          await pass();
        } while (this.requested);
      })
      .finally(() => {
        this.active = null;
      });
    return this.active;
  }
}
