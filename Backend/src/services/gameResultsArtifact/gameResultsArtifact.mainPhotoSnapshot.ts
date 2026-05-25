export type MainPhotoEnqueueSnapshot = {
  userPhotoCountAtEnqueue: number;
  mainPhotoIdAtEnqueue: string | null;
};

export type MainPhotoCurrentState = {
  photosCount: number;
  mainPhotoId: string | null;
};

/** Race-safe: set AI photo as main only when game photo state still matches enqueue snapshot. */
export function shouldSetAiAsMainPhoto(
  snapshot: MainPhotoEnqueueSnapshot,
  current: MainPhotoCurrentState
): boolean {
  return (
    snapshot.userPhotoCountAtEnqueue === 0 &&
    current.photosCount === snapshot.userPhotoCountAtEnqueue &&
    current.mainPhotoId === snapshot.mainPhotoIdAtEnqueue
  );
}
