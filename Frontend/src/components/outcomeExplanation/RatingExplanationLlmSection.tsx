import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import {
  getOutcomeRatingExplanationLlm,
  getOutcomeRatingExplanationTranslation,
} from '@/api/results';
import { useAuthStore } from '@/store/authStore';
import { extractLanguageCode } from '@/utils/displayPreferences';
import { TRANSLATION_LANGUAGES } from '@/utils/translationLanguages';
import { RatingExplanationTranslateControl } from './RatingExplanationTranslateControl';

const POLL_START_MS = 500;
const POLL_MAX_MS = 2000;
/** Keep above backend PENDING_STALE_MS (90s) so UI does not give up while server may still finish. */
const POLL_DEADLINE_MS = 105_000;

type UiPhase = 'boot' | 'pending' | 'ready' | 'failed' | 'hidden';

interface RatingExplanationLlmSectionProps {
  gameId: string;
  userId: string;
}

function resolveUiLanguage(i18nLanguage: string | undefined): string {
  return extractLanguageCode(i18nLanguage || 'en') || 'en';
}

function isTranslatableLanguage(code: string): boolean {
  return TRANSLATION_LANGUAGES.some((l) => l.code === code);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function preferredDisplayLanguage(appLanguage: string, sourceLanguage: string): string {
  const code = resolveUiLanguage(appLanguage);
  return isTranslatableLanguage(code) ? code : sourceLanguage;
}

export function RatingExplanationLlmSection({ gameId, userId }: RatingExplanationLlmSectionProps) {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [phase, setPhase] = useState<UiPhase>('boot');
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  /** Language of the text currently shown. */
  const [committedLanguage, setCommittedLanguage] = useState<string | null>(null);
  const [committedText, setCommittedText] = useState<string | null>(null);
  /** Language being fetched (null when idle). */
  const [loadingLanguage, setLoadingLanguage] = useState<string | null>(null);
  const [translateFailedLanguage, setTranslateFailedLanguage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [translateRequest, setTranslateRequest] = useState<{
    language: string;
    retry: boolean;
    nonce: number;
  } | null>(null);

  const sourceRequestIdRef = useRef(0);
  const translateRequestIdRef = useRef(0);
  const forceSourceRetryRef = useRef(false);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const appLanguage = resolveUiLanguage(i18n.language);
  const appLanguageRef = useRef(appLanguage);
  appLanguageRef.current = appLanguage;

  const commitLanguage = useCallback((language: string, text: string) => {
    cacheRef.current.set(language, text);
    setCommittedLanguage(language);
    setCommittedText(text);
    setLoadingLanguage(null);
    setTranslateFailedLanguage(null);
  }, []);

  const requestLanguage = useCallback(
    (language: string, options?: { retry?: boolean }) => {
      if (!sourceLanguage || !sourceText) return;

      if (language === sourceLanguage) {
        commitLanguage(sourceLanguage, sourceText);
        setTranslateRequest(null);
        return;
      }

      const cached = cacheRef.current.get(language);
      if (cached && !options?.retry) {
        commitLanguage(language, cached);
        setTranslateRequest(null);
        return;
      }

      setTranslateFailedLanguage(null);
      setLoadingLanguage(language);
      setTranslateRequest({
        language,
        retry: Boolean(options?.retry),
        nonce: Date.now(),
      });
    },
    [sourceLanguage, sourceText, commitLanguage],
  );

  // Load / generate original insight once per game+user.
  useEffect(() => {
    const requestId = ++sourceRequestIdRef.current;
    const preferredAtStart = appLanguageRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_START_MS;
    const startedAt = Date.now();
    let sendRetry = forceSourceRetryRef.current;
    forceSourceRetryRef.current = false;

    setPhase((prev) => (prev === 'ready' || prev === 'failed' ? 'pending' : 'boot'));
    if (sendRetry) {
      cacheRef.current.clear();
      setSourceText(null);
      setSourceLanguage(null);
      setCommittedText(null);
      setCommittedLanguage(null);
      setLoadingLanguage(null);
      setTranslateFailedLanguage(null);
      setTranslateRequest(null);
    }

    const poll = async () => {
      try {
        const result = await getOutcomeRatingExplanationLlm(gameId, userId, preferredAtStart, {
          retry: sendRetry,
        });
        sendRetry = false;
        if (cancelled || requestId !== sourceRequestIdRef.current) return;

        if (result.status === 'ready' && result.text) {
          const lang = result.sourceLanguage || result.language || preferredAtStart;
          setSourceText(result.text);
          setSourceLanguage(lang);
          cacheRef.current.set(lang, result.text);
          setPhase('ready');

          const target = preferredDisplayLanguage(preferredAtStart, lang);
          if (target === lang) {
            commitLanguage(lang, result.text);
          } else {
            setCommittedLanguage(lang);
            setCommittedText(result.text);
            setLoadingLanguage(target);
            // Do not force retry on first open — avoids preempting an in-flight translation.
            setTranslateRequest({ language: target, retry: false, nonce: Date.now() });
          }
          return;
        }

        if (result.status === 'pending') {
          setPhase('pending');
          if (Date.now() - startedAt >= POLL_DEADLINE_MS) {
            setPhase('failed');
            return;
          }
          timer = setTimeout(() => {
            if (cancelled || requestId !== sourceRequestIdRef.current) return;
            void poll();
          }, delay);
          delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.35));
          return;
        }

        if (result.status === 'failed') {
          setPhase('failed');
          return;
        }

        setPhase('hidden');
      } catch {
        if (cancelled || requestId !== sourceRequestIdRef.current) return;
        setPhase('failed');
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, userId, retryToken, commitLanguage]);

  // When the app language changes after source is ready, switch display locale.
  // Never force retry on cache miss — that would preempt a fresh in-flight translation.
  const prevAppLanguageRef = useRef(appLanguage);
  useEffect(() => {
    if (phase !== 'ready' || !sourceLanguage || !sourceText) return;
    if (prevAppLanguageRef.current === appLanguage) return;
    prevAppLanguageRef.current = appLanguage;
    const target = preferredDisplayLanguage(appLanguage, sourceLanguage);
    requestLanguage(target);
  }, [appLanguage, phase, sourceLanguage, sourceText, requestLanguage]);

  // Translate poller
  useEffect(() => {
    if (!translateRequest || !sourceLanguage || !sourceText) return;

    const requestId = ++translateRequestIdRef.current;
    const { language: targetLanguage, retry } = translateRequest;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_START_MS;
    const startedAt = Date.now();
    let sendRetry = retry;
    let didAutoRecover = false;

    setLoadingLanguage(targetLanguage);

    const fail = () => {
      if (cancelled || requestId !== translateRequestIdRef.current) return;
      setLoadingLanguage(null);
      setTranslateFailedLanguage(targetLanguage);
      setTranslateRequest(null);
    };

    const poll = async () => {
      try {
        const result = await getOutcomeRatingExplanationTranslation(gameId, userId, targetLanguage, {
          retry: sendRetry,
        });
        sendRetry = false;
        if (cancelled || requestId !== translateRequestIdRef.current) return;

        if (result.status === 'ready' && result.text) {
          commitLanguage(targetLanguage, result.text);
          setTranslateRequest(null);
          return;
        }

        if (result.status === 'pending') {
          if (Date.now() - startedAt >= POLL_DEADLINE_MS) {
            fail();
            return;
          }
          timer = setTimeout(() => {
            if (cancelled || requestId !== translateRequestIdRef.current) return;
            void poll();
          }, delay);
          delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.35));
          return;
        }

        if (result.status === 'failed' && !didAutoRecover) {
          didAutoRecover = true;
          sendRetry = true;
          timer = setTimeout(() => {
            if (cancelled || requestId !== translateRequestIdRef.current) return;
            void poll();
          }, delay);
          return;
        }

        fail();
      } catch {
        fail();
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [translateRequest, gameId, userId, sourceLanguage, sourceText, commitLanguage]);

  const onRetrySource = useCallback(() => {
    forceSourceRetryRef.current = true;
    setRetryToken((n) => n + 1);
  }, []);

  const onSelectLanguage = useCallback(
    (language: string) => {
      // Cache miss → poll/start without retry (protects fresh pending on server).
      requestLanguage(language);
    },
    [requestLanguage],
  );

  const onRetryTranslate = useCallback(() => {
    if (!translateFailedLanguage) return;
    requestLanguage(translateFailedLanguage, { retry: true });
  }, [translateFailedLanguage, requestLanguage]);

  if (phase === 'boot' || phase === 'hidden') {
    return null;
  }

  const isTranslating = Boolean(loadingLanguage);
  const activeLanguage = loadingLanguage || committedLanguage || sourceLanguage || appLanguage;
  const showingOriginal = Boolean(
    sourceLanguage && committedLanguage === sourceLanguage && !loadingLanguage,
  );

  return (
    <section
      className="mb-6 overflow-hidden rounded-xl border border-blue-200/80 dark:border-blue-800/70 bg-gradient-to-br from-blue-50 to-indigo-50/70 dark:from-blue-950/40 dark:to-indigo-950/30"
      aria-live="polite"
      aria-busy={phase === 'pending' || isTranslating}
    >
      <div className="px-4 pt-4 pb-1 sm:px-5 sm:pt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {t('gameResults.llmRatingInsightTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t('gameResults.llmRatingInsightSubtitle')}
          </p>
        </div>
        {phase === 'ready' && sourceLanguage && (
          <RatingExplanationTranslateControl
            sourceLanguage={sourceLanguage}
            activeLanguage={activeLanguage}
            isTranslating={isTranslating}
            onSelectLanguage={onSelectLanguage}
          />
        )}
      </div>

      <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {phase === 'pending' && (
          <div className="space-y-2.5" role="status">
            <div className="h-3.5 w-[92%] rounded bg-slate-200/80 dark:bg-slate-700/70 animate-pulse" />
            <div className="h-3.5 w-[88%] rounded bg-slate-200/80 dark:bg-slate-700/70 animate-pulse" />
            <div className="h-3.5 w-[70%] rounded bg-slate-200/80 dark:bg-slate-700/70 animate-pulse" />
            <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('gameResults.llmRatingInsightLoading')}
            </p>
          </div>
        )}

        {phase === 'ready' && committedText && (
          <div className="relative">
            {isTranslating && (
              <div className="absolute inset-0 z-10 rounded-lg bg-white/55 dark:bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t('gameResults.llmRatingInsightTranslating')}
                </p>
              </div>
            )}
            <div
              className={`space-y-3 text-[15px] leading-relaxed text-slate-800 dark:text-slate-100 animate-in fade-in duration-300 ${
                isTranslating ? 'opacity-40' : ''
              }`}
            >
              {splitParagraphs(committedText).map((paragraph, index) => (
                <p key={`${committedLanguage}-${index}`}>{paragraph}</p>
              ))}
            </div>
            {!showingOriginal && !isTranslating && !translateFailedLanguage && (
              <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                {t('gameResults.llmRatingInsightTranslatedFrom', {
                  language: sourceLanguage?.toUpperCase(),
                })}
              </p>
            )}
            {translateFailedLanguage && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('gameResults.llmRatingInsightTranslateFailed')}
                </p>
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={onRetryTranslate}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw size={12} />
                    {t('gameResults.llmRatingInsightRetry')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t('gameResults.llmRatingInsightFailed')}
            </p>
            {isAuthenticated && (
              <button
                type="button"
                onClick={onRetrySource}
                className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-900 transition-colors"
              >
                <RefreshCw size={14} />
                {t('gameResults.llmRatingInsightRetry')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
