import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAxiosError } from 'axios';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import { faqApi, type FaqTranslationStatus } from '@/api/faq';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useNetworkStore } from '@/utils/networkStatus';
import { FAQ_LANGUAGE_FLAGS, FAQ_LANGUAGE_NAMES } from '@/utils/faqLanguages';

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 45;
const STATUS_STATES = ['ready', 'pending', 'failed', 'stale', 'missing'] as const;
const STATUS_COLORS = {
  ready: 'text-green-700 dark:text-green-300',
  pending: 'text-amber-700 dark:text-amber-300',
  failed: 'text-red-700 dark:text-red-300',
  stale: 'text-amber-700 dark:text-amber-300',
  missing: 'text-gray-500 dark:text-gray-400',
} as const;

type Props = { gameId: string; open: boolean; onClose: () => void };

export function FaqTranslationsModal({ gameId, open, onClose }: Props) {
  const { t } = useTranslation();
  const online = useNetworkStore((state) => state.isOnline);
  const [status, setStatus] = useState<FaqTranslationStatus | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const requestVersion = useRef(0);
  const busy = useRef(false);
  const initialized = useRef(false);
  const selectionDirty = useRef(false);
  const mutationBusy = useRef(false);
  const pollAttempts = useRef(0);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const gameIdRef = useRef(gameId);
  onCloseRef.current = onClose;
  openRef.current = open;
  gameIdRef.current = gameId;

  useBackButtonModal(open, onClose, `faq-translations-${gameId}`);

  const refresh = useCallback(async (initial = false) => {
    if (busy.current || mutationBusy.current) return;
    busy.current = true;
    const version = requestVersion.current;
    if (initial) setLoading(true);
    try {
      const response = await faqApi.getTranslations(gameId);
      if (version !== requestVersion.current) return;
      setStatus(response.data);
      setError('');
      if (initial || !initialized.current || !selectionDirty.current) {
        setSource(response.data.sourceLocaleOverride);
        setTargets(response.data.selectedLocales.filter((locale) => locale !== response.data.sourceLocaleOverride));
        initialized.current = true;
      }
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(isAxiosError(cause) ? cause.response?.data?.message || t('faq.translation.loadError') : t('faq.translation.loadError'));
    } finally {
      if (version === requestVersion.current) busy.current = false;
      // A recovery read can supersede the initial read after close/reopen.
      // Whichever current request finishes owns the loading state.
      if (version === requestVersion.current) setLoading(false);
    }
  }, [gameId, t]);

  useEffect(() => {
    if (!open) return;
    requestVersion.current += 1;
    pollAttempts.current = 0;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStatus(null);
    setError('');
    setSubmitted(false);
    setSubmitting(false);
    setTargets([]);
    setSource(null);
    initialized.current = false;
    selectionDirty.current = false;
    busy.current = false;
    mutationBusy.current = false;
    closeRef.current?.focus();
    void refresh(true);
    return () => {
      requestVersion.current += 1;
      previousFocus.current?.focus();
    };
  }, [open, gameId, refresh]);

  const pending = status?.locales.some((row) => row.pending > 0) ?? false;
  useEffect(() => {
    if (!open || !online || !pending || pollAttempts.current >= MAX_POLL_ATTEMPTS) return;
    const version = requestVersion.current;
    const timer = window.setTimeout(() => {
      pollAttempts.current += 1;
      void refresh().finally(() => {
        if (version === requestVersion.current) setPollTick((value) => value + 1);
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [open, online, pending, status, pollTick, refresh]);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onOnline = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const submit = async (retry: boolean) => {
    if (!status || !online || submitting || targets.length === 0) return;
    const version = ++requestVersion.current;
    mutationBusy.current = true;
    busy.current = false;
    setSubmitting(true);
    setError('');
    try {
      const body = { targetLocales: targets, sourceLocaleOverride: source, expectedSnapshot: status.snapshot };
      const response = retry ? await faqApi.retryTranslations(gameId, body) : await faqApi.submitTranslations(gameId, body);
      if (version !== requestVersion.current) {
        if (openRef.current && gameIdRef.current === gameId && !mutationBusy.current) {
          requestVersion.current += 1;
          busy.current = false;
          void refresh();
        }
        return;
      }
      setStatus(response.data);
      if (!retry) selectionDirty.current = false;
      setSubmitted(true);
      pollAttempts.current = 0;
    } catch (cause) {
      if (version !== requestVersion.current) return;
      if (isAxiosError(cause) && cause.response?.status === 409) {
        setError(t('faq.translation.changedError'));
        mutationBusy.current = false;
        void refresh();
      } else {
        setError(isAxiosError(cause) ? cause.response?.data?.message || t('faq.translation.submitError') : t('faq.translation.submitError'));
      }
    } finally {
      if (version === requestVersion.current) {
        mutationBusy.current = false;
        setSubmitting(false);
      }
    }
  };

  if (!open) return null;
  const availableTargets = APP_UI_LANGUAGES.filter((locale) => locale !== source);
  const matchesSavedSource = source === status?.sourceLocaleOverride;
  const complete = matchesSavedSource && targets.length > 0 && status && status.faqCount > 0
    && targets.every(locale => status.locales.find(row => row.locale === locale)?.ready === status.faqCount);
  const failed = matchesSavedSource && (status?.locales.some((row) => targets.includes(row.locale) && row.failed > 0) ?? false);
  const disabledReason = !online ? t('faq.translation.offline') : status && !status.generationEnabled ? t('faq.translation.unavailable') : '';
  const statusChips = (row: FaqTranslationStatus['locales'][number]) => (
    STATUS_STATES.filter((state) => row[state] > 0).map((state) => (
      <span key={state} className={`inline-flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[state]}`}>
        <span className="tabular-nums">{row[state]}</span>
        {t(`faq.translation.status.${state}`)}
      </span>
    ))
  );

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label={t('common.close')} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="faq-translation-title" aria-describedby="faq-translation-description" className="relative flex max-h-[min(92dvh,760px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="faq-translation-title" className="text-lg font-semibold text-gray-900 dark:text-white">{t('faq.translation.title')}</h2>
            <p id="faq-translation-description" className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('faq.translation.description')}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-full p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" aria-label={t('app.loading')} /></div>}
          {!loading && status && <>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{t('faq.translation.questionCount', { count: status.faqCount })}</p>
            <div className="space-y-1">
              <label htmlFor="faq-translation-source" className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">{t('faq.translation.source')}</label>
              <select id="faq-translation-source" disabled={submitting} value={source ?? ''} onChange={(event) => {
                selectionDirty.current = true;
                const next = event.target.value || null;
                setSource(next);
                setTargets((current) => current.filter((locale) => locale !== next));
              }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                <option value="">{t('faq.translation.detectAutomatically')}</option>
                {APP_UI_LANGUAGES.map((locale) => <option key={locale} value={locale}>{FAQ_LANGUAGE_FLAGS[locale]} {FAQ_LANGUAGE_NAMES[locale]}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('faq.translation.sourceHint')}</p>
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-gray-900 dark:text-white">{t('faq.translation.targets', { count: targets.length })}</legend>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <button type="button" disabled={submitting} onClick={() => { selectionDirty.current = true; setTargets([...availableTargets]); }} className="text-primary-700 underline disabled:opacity-50 dark:text-primary-300">{t('faq.translation.selectAll')}</button>
                <button type="button" disabled={submitting} onClick={() => { selectionDirty.current = true; setTargets([]); }} className="text-primary-700 underline disabled:opacity-50 dark:text-primary-300">{t('faq.translation.clearSelection')}</button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableTargets.map((locale) => {
                  const row = status.locales.find((item) => item.locale === locale);
                  const selected = targets.includes(locale);
                  return <label key={locale} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary-500/40 ${selected ? 'border-primary-500 bg-primary-50/80 dark:border-primary-500 dark:bg-primary-900/20' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'}`}>
                    <span aria-hidden="true" className="shrink-0 text-2xl leading-none">{FAQ_LANGUAGE_FLAGS[locale]}</span>
                    <span className="min-w-0 flex-1 text-gray-900 dark:text-white">
                      <span className="block font-semibold" lang={locale} dir="auto">{FAQ_LANGUAGE_NAMES[locale]}</span>
                      {matchesSavedSource && row && <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{statusChips(row)}</span>}
                    </span>
                    <input type="checkbox" disabled={submitting} checked={selected} onChange={(event) => { selectionDirty.current = true; setTargets((current) => event.target.checked ? [...current, locale] : current.filter((item) => item !== locale)); }} className="mt-1 shrink-0 accent-primary-600" />
                  </label>;
                })}
              </div>
            </fieldset>
            {!matchesSavedSource && <p className="text-xs text-gray-500 dark:text-gray-400">{t('faq.translation.sourceCountsHint')}</p>}
            {submitted && pending && <p className="text-sm text-gray-600 dark:text-gray-300">{t('faq.translation.background')}</p>}
            {complete && <p role="status" className="text-sm text-green-700 dark:text-green-300">{t('faq.translation.completed')}</p>}
            {pending && <p role="status" aria-live="polite" className="text-sm text-primary-700 dark:text-primary-300">{t('faq.translation.inProgress')}</p>}
            {pending && pollAttempts.current >= MAX_POLL_ATTEMPTS && <p className="text-sm text-gray-600 dark:text-gray-300">{t('faq.translation.pollPaused')} <button type="button" onClick={() => { pollAttempts.current = 0; void refresh(); }} className="underline">{t('faq.translation.refresh')}</button></p>}
          </>}
          {disabledReason && <p className="text-sm text-amber-700 dark:text-amber-300">{disabledReason}</p>}
          {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error} <button type="button" onClick={() => void refresh(!status)} className="underline">{t('faq.translation.refresh')}</button></div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 pt-4 dark:border-gray-700" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-gray-700 dark:text-gray-200">{t('common.close')}</button>
          {failed && <button type="button" disabled={submitting || !online || !status?.generationEnabled} onClick={() => void submit(true)} className="rounded-lg border border-primary-600 px-4 py-2 text-primary-700 disabled:opacity-50 dark:text-primary-300">{t('faq.translation.retryFailed')}</button>}
          <button type="button" disabled={submitting || !status || !online || !status.generationEnabled || targets.length === 0} onClick={() => void submit(false)} className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {submitting ? t('faq.translation.submitting') : t('faq.translation.translateTo', { count: targets.length })}
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
