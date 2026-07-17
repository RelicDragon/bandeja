import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  fetchLinkPreviewDetailed,
  isRichLinkPreview,
  type LinkPreviewData,
  type LinkPreviewOutcome,
} from '@/api/linkPreview';
import { isEligibleLinkPreviewUrl } from '@/components/MessageItem/linkPreview/eligibility';
import { seedLinkPreviewCache } from '@/components/MessageItem/linkPreview/useLinkPreview';
import { parseUrls } from '@/utils/parseUrls';

type State = {
  selectedUrl: string | null;
  disabled: boolean;
  snapshotToken: string | null;
};

function storageKey(draftKey: string): string {
  return `chat:composer-link-preview:${draftKey}`;
}

function loadState(draftKey: string): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(draftKey)) ?? '{}') as Partial<State>;
    return {
      selectedUrl: typeof parsed.selectedUrl === 'string' ? parsed.selectedUrl : null,
      disabled: parsed.disabled === true,
      snapshotToken: typeof parsed.snapshotToken === 'string' ? parsed.snapshotToken : null,
    };
  } catch {
    return { selectedUrl: null, disabled: false, snapshotToken: null };
  }
}

export function useComposerLinkPreview(content: string, draftKey: string) {
  const urls = useMemo(
    () =>
      Array.from(
        new Set(
          parseUrls(content)
            .filter((part) => part.type === 'url' && part.url && isEligibleLinkPreviewUrl(part.url))
            .map((part) => part.url!)
        )
      ),
    [content]
  );
  const [state, setState] = useState<State>(() => loadState(draftKey));
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [outcome, setOutcome] = useState<LinkPreviewOutcome>('unsupported');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [retryReady, setRetryReady] = useState(true);
  const [snapshotToken, setSnapshotToken] = useState<string | null>(
    () => loadState(draftKey).snapshotToken
  );
  const selectedUrl =
    state.selectedUrl && urls.includes(state.selectedUrl) ? state.selectedUrl : (urls[0] ?? null);
  const disabled =
    state.disabled && !!selectedUrl && state.selectedUrl === selectedUrl && urls.includes(selectedUrl);

  useEffect(() => {
    const restored = loadState(draftKey);
    setState(restored);
    setSnapshotToken(restored.snapshotToken);
    setPreview(null);
    setOutcome('unsupported');
  }, [draftKey]);

  useEffect(() => {
    const onDraftDeleted = (event: Event) => {
      const detail = (event as CustomEvent<{
        chatContextType?: string;
        contextId?: string;
        chatType?: string;
      }>).detail;
      const deletedKey = `${detail?.chatContextType}:${detail?.contextId}:${detail?.chatType}`;
      if (deletedKey !== draftKey) return;
      localStorage.removeItem(storageKey(draftKey));
      setState({ selectedUrl: null, disabled: false, snapshotToken: null });
      setSnapshotToken(null);
    };
    window.addEventListener('draft-deleted', onDraftDeleted);
    return () => window.removeEventListener('draft-deleted', onDraftDeleted);
  }, [draftKey]);

  useEffect(() => {
    if (urls.length === 0) {
      setPreview(null);
      setSnapshotToken(null);
      setLoading(false);
      return;
    }
    const next = { selectedUrl, disabled, snapshotToken };
    localStorage.setItem(storageKey(draftKey), JSON.stringify(next));
  }, [draftKey, selectedUrl, disabled, snapshotToken, urls.length]);

  useEffect(() => {
    if (!selectedUrl || disabled) {
      setPreview(null);
      setSnapshotToken(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreview(null);
    setOutcome('unsupported');
    setRetryAt(0);
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetchLinkPreviewDetailed(selectedUrl, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          const rich = isRichLinkPreview(result.preview) ? result.preview : null;
          setPreview(rich);
          setOutcome(result.outcome);
          setRetryAt(result.retryAfterMs ? Date.now() + result.retryAfterMs : 0);
          setSnapshotToken(result.snapshotToken);
          seedLinkPreviewCache(selectedUrl, rich);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const canceled =
            isAxiosError(error) &&
            (error.code === 'ERR_CANCELED' || error.name === 'CanceledError');
          if (!canceled) {
            setPreview(null);
            setOutcome('temporary');
            setRetryAt(0);
            setSnapshotToken(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedUrl, disabled, attempt]);

  useEffect(() => {
    if (retryAt <= Date.now()) {
      setRetryReady(true);
      return;
    }
    setRetryReady(false);
    const timer = window.setTimeout(() => setRetryReady(true), retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  const selectUrl = useCallback((url: string) => {
    setState({ selectedUrl: url, disabled: false, snapshotToken: null });
  }, []);
  const remove = useCallback(() => {
    setState({ selectedUrl, disabled: true, snapshotToken: null });
  }, [selectedUrl]);

  return {
    urls,
    selectedUrl,
    preview,
    loading,
    outcome,
    disabled,
    selectUrl,
    remove,
    canRetry: retryReady,
    snapshotToken,
    retry: () => {
      if (retryAt > Date.now()) return;
      setAttempt((value) => value + 1);
    },
  };
}
