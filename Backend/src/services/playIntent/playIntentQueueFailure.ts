import { reportCriticalError } from '../developerAlert.service';

export function reportPlayIntentQueueError(
  queue: string,
  context: string,
  error: string,
): void {
  const failure = new Error(`${queue} ${context}: ${error}`);
  console.error(failure);
  void reportCriticalError(failure, queue);
}
