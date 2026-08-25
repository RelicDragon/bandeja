import type { PendingStoreReview, ReleaseSession } from './app-release-session';

export interface StoreReviewSnapshot {
  android?: PendingStoreReview;
  ios?: PendingStoreReview;
}

export type StoreReviewApprovalChoice = 'both' | 'android' | 'ios';

export function androidReviewFingerprint(review: PendingStoreReview | undefined): string | undefined {
  if (review?.inReview !== true) {
    return undefined;
  }
  if (review.versionCodes?.length) {
    const versionCodes = [...new Set(review.versionCodes)].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
    return `release:${review.version ?? ''}|version-codes:${versionCodes.join(',')}`;
  }
  if (review.versionCode) {
    return `release:${review.version ?? ''}|version-code:${review.versionCode}`;
  }
  if (review.version) {
    return `release:${review.version}`;
  }
  return undefined;
}

export function iosReviewIsCanceling(review: PendingStoreReview | undefined): boolean {
  return review?.inReview === true && review.state === 'CANCELING';
}

export function mergeStoreReviewSnapshot(
  session: ReleaseSession,
  detected: StoreReviewSnapshot,
  checkedAt: string,
): ReleaseSession {
  const checkedAndroid = detected.android !== undefined;
  const detectedAndroidFingerprint = androidReviewFingerprint(detected.android);
  const keepAndroidApproval =
    checkedAndroid &&
    detectedAndroidFingerprint !== undefined &&
    session.reviewGuard.androidReplacementApprovedFingerprint === detectedAndroidFingerprint;

  const checkedIos = detected.ios !== undefined;
  const keepIosApproval =
    checkedIos &&
    detected.ios?.inReview === true &&
    detected.ios.submissionId !== undefined &&
    session.reviewGuard.iosRemovalApprovedSubmissionId === detected.ios.submissionId;

  return {
    ...session,
    reviewGuard: {
      ...session.reviewGuard,
      checkedAt,
      ...(detected.android ? { android: detected.android } : {}),
      ...(detected.ios ? { ios: detected.ios } : {}),
      ...(checkedAndroid
        ? {
            androidReplacementApprovedFingerprint: keepAndroidApproval
              ? session.reviewGuard.androidReplacementApprovedFingerprint
              : undefined,
          }
        : {}),
      ...(checkedIos
        ? {
            iosRemovalApprovedSubmissionId: keepIosApproval
              ? session.reviewGuard.iosRemovalApprovedSubmissionId
              : undefined,
          }
        : {}),
    },
  };
}

export function androidReviewNeedsApproval(session: ReleaseSession): boolean {
  const fingerprint = androidReviewFingerprint(session.reviewGuard.android);
  return (
    session.reviewGuard.android?.inReview === true &&
    (!fingerprint || session.reviewGuard.androidReplacementApprovedFingerprint !== fingerprint)
  );
}

export function iosReviewNeedsApproval(session: ReleaseSession): boolean {
  const review = session.reviewGuard.ios;
  if (review?.inReview !== true || iosReviewIsCanceling(review)) {
    return false;
  }
  return (
    !review.submissionId ||
    session.reviewGuard.iosRemovalApprovedSubmissionId !== review.submissionId
  );
}

export function approveStoreReviews(
  session: ReleaseSession,
  choice: StoreReviewApprovalChoice,
  options?: { narrowTarget?: boolean },
): ReleaseSession {
  const approveAndroid = choice === 'both' || choice === 'android';
  const approveIos = choice === 'both' || choice === 'ios';
  const androidFingerprint = androidReviewFingerprint(session.reviewGuard.android);
  const iosSubmissionId = session.reviewGuard.ios?.submissionId;

  if (approveAndroid && !androidFingerprint) {
    throw new Error('Google Play review has no stable release identity');
  }
  if (approveIos && !iosSubmissionId) {
    throw new Error('App Store review has no submission id');
  }

  return {
    ...session,
    targetPlatform: options?.narrowTarget ? (choice === 'both' ? 'both' : choice) : session.targetPlatform,
    reviewGuard: {
      ...session.reviewGuard,
      ...(approveAndroid
        ? { androidReplacementApprovedFingerprint: androidFingerprint }
        : {}),
      ...(approveIos ? { iosRemovalApprovedSubmissionId: iosSubmissionId } : {}),
    },
  };
}
