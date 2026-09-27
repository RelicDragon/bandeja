import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { faqApi, type Faq, type FaqTranslationStatus } from '@/api/faq';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { APP_UI_LANGUAGES, normalizeAppUiLanguage } from '@bandeja/app-locale';
import { FIXED_TEAM_STANDINGS_FAQ_ID, withFixedTeamStandingsFaq } from '@/utils/leagueFixedTeamStandingsFaq';
import { FAQ_LANGUAGE_FLAGS, FAQ_LANGUAGE_NAMES } from '@/utils/faqLanguages';
import { useNetworkStore } from '@/utils/networkStatus';

interface FaqTabProps {
  gameId: string;
  /** League season with fixed teams: inject standings tie-break Q&A. */
  includeFixedTeamStandingsFaq?: boolean;
}

type Selection = 'original' | (typeof APP_UI_LANGUAGES)[number];
const MAX_POLL_ATTEMPTS = 20;
const pollDelay = (attempt: number) => Math.min(8000, 2000 * 2 ** Math.floor(attempt / 4));

export const FaqTab = ({ gameId, includeFixedTeamStandingsFaq = false }: FaqTabProps) => {
  const { t, i18n } = useTranslation();
  const appLocale = normalizeAppUiLanguage(i18n.resolvedLanguage || i18n.language);
  const online = useNetworkStore((state) => state.isOnline);
  const [selection, setSelection] = useState<Selection>(appLocale);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqStateGameId, setFaqStateGameId] = useState(gameId);
  const [faqLoaded, setFaqLoaded] = useState(false);
  const [faqError, setFaqError] = useState(false);
  const [status, setStatus] = useState<FaqTranslationStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pollTick, setPollTick] = useState(0);
  const epoch = useRef(0);
  const faqRequest = useRef(0);
  const statusRequest = useRef(0);
  const statusBusyEpoch = useRef<number | null>(null);
  const mutationBusyEpoch = useRef<number | null>(null);
  const pollAttempts = useRef(0);
  const attempted = useRef(new Set<string>());
  const manualChoice = useRef(false);
  const previousSelection = useRef<Selection>(selection);
  const gameRef = useRef(gameId);
  const selectionRef = useRef(selection);
  const onlineRef = useRef(online);
  const wasOnline = useRef(online);
  const appLocaleRef = useRef(appLocale);
  gameRef.current = gameId;
  selectionRef.current = selection;
  onlineRef.current = online;
  appLocaleRef.current = appLocale;

  const current = useCallback((token: number, id: string, locale: Selection) =>
    epoch.current === token && gameRef.current === id && selectionRef.current === locale, []);

  const loadFaqs = useCallback(async (id: string, locale: Selection, token: number) => {
    const request = ++faqRequest.current;
    try {
      const response = await faqApi.getGameFaqs(id, locale === 'original' ? undefined : locale);
      if (!current(token, id, locale) || request !== faqRequest.current) return;
      setFaqStateGameId(id);
      setFaqs(response.data);
      setFaqError(false);
    } catch {
      if (current(token, id, locale) && request === faqRequest.current) setFaqError(true);
    } finally {
      if (current(token, id, locale) && request === faqRequest.current) setFaqLoaded(true);
    }
  }, [current]);

  const requestTranslation = useCallback(async (id: string, locale: Exclude<Selection, 'original'>, token: number, retry: boolean) => {
    if (!current(token, id, locale) || mutationBusyEpoch.current === token) return;
    mutationBusyEpoch.current = token;
    const request = ++statusRequest.current;
    setRequesting(true);
    setRequestError(false);
    try {
      const response = await faqApi.requestReaderTranslation(id, locale, retry);
      if (!current(token, id, locale) || request !== statusRequest.current) return;
      setStatus(response.data);
      pollAttempts.current = 0;
      const row = response.data.locales.find((item) => item.locale === locale);
      if (row?.ready) await loadFaqs(id, locale, token);
    } catch {
      if (current(token, id, locale) && request === statusRequest.current) setRequestError(true);
    } finally {
      if (mutationBusyEpoch.current === token) mutationBusyEpoch.current = null;
      if (current(token, id, locale)) setRequesting(false);
    }
  }, [current, loadFaqs]);

  const checkStatus = useCallback(async (id: string, locale: Exclude<Selection, 'original'>, token: number) => {
    if (statusBusyEpoch.current === token || mutationBusyEpoch.current === token) return;
    statusBusyEpoch.current = token;
    const request = ++statusRequest.current;
    try {
      const response = await faqApi.getTranslations(id);
      if (!current(token, id, locale) || request !== statusRequest.current) return;
      const data = response.data;
      setStatus(data);
      setStatusError(false);
      const row = data.locales.find((item) => item.locale === locale);
      if (row?.ready) await loadFaqs(id, locale, token);
      if (!current(token, id, locale) || request !== statusRequest.current) return;
      if (!row || !onlineRef.current || !data.generationEnabled || row.missing + row.stale === 0) return;
      const key = `${id}:${locale}:${data.snapshot}:${data.sourceLocaleOverride ?? 'auto'}`;
      if (attempted.current.has(key)) return;
      attempted.current.add(key);
      await requestTranslation(id, locale, token, false);
    } catch {
      if (current(token, id, locale) && request === statusRequest.current) setStatusError(true);
    } finally {
      if (statusBusyEpoch.current === token) statusBusyEpoch.current = null;
    }
  }, [current, loadFaqs, requestTranslation]);

  useEffect(() => {
    manualChoice.current = false;
    attempted.current.clear();
    setSelection(appLocaleRef.current);
    setFaqStateGameId(gameId);
    setFaqs([]);
    setFaqLoaded(false);
    setExpandedIds(new Set());
  }, [gameId]); // The app-locale effect below owns later language changes.

  useEffect(() => {
    if (!manualChoice.current) setSelection(appLocale);
  }, [appLocale]);

  useEffect(() => {
    if (previousSelection.current !== selection && selection !== 'original') {
      for (const key of attempted.current) {
        if (key.startsWith(`${gameId}:${selection}:`)) attempted.current.delete(key);
      }
    }
    previousSelection.current = selection;
    const token = ++epoch.current;
    pollAttempts.current = 0;
    setStatus(null);
    setStatusError(false);
    setRequestError(false);
    setRequesting(false);
    setFaqError(false);
    void loadFaqs(gameId, selection, token);
    if (selection !== 'original') void checkStatus(gameId, selection, token);
    return () => { epoch.current += 1; };
  }, [gameId, selection, loadFaqs, checkStatus]);

  useEffect(() => {
    if (!wasOnline.current && online) {
      const token = epoch.current;
      const locale = selectionRef.current;
      const id = gameRef.current;
      void loadFaqs(id, locale, token);
      if (locale !== 'original') void checkStatus(id, locale, token);
    }
    wasOnline.current = online;
  }, [online, loadFaqs, checkStatus]);

  useEffect(() => {
    if (!online) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const token = epoch.current;
      const locale = selectionRef.current;
      const id = gameRef.current;
      void loadFaqs(id, locale, token);
      if (locale !== 'original') void checkStatus(id, locale, token);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [online, loadFaqs, checkStatus]);

  const row = selection === 'original' ? null : status?.locales.find((item) => item.locale === selection);
  const pending = Boolean(row?.pending) || requesting;
  useEffect(() => {
    if (!online || selection === 'original' || !row?.pending || pollAttempts.current >= MAX_POLL_ATTEMPTS) return;
    const token = epoch.current;
    const timer = window.setTimeout(() => {
      pollAttempts.current += 1;
      void checkStatus(gameId, selection, token).finally(() => {
        if (current(token, gameId, selection)) setPollTick((value) => value + 1);
      });
    }, pollDelay(pollAttempts.current));
    return () => window.clearTimeout(timer);
  }, [online, selection, row?.pending, status, pollTick, gameId, checkStatus, current]);

  const fixedLocale = selection === 'original' ? appLocale : selection;
  const fixedT = i18n.getFixedT(fixedLocale);
  const contentLoaded = faqStateGameId === gameId && faqLoaded;
  const displayFaqs = useMemo(
    () => withFixedTeamStandingsFaq(faqStateGameId === gameId ? faqs : [], gameId, includeFixedTeamStandingsFaq, fixedT),
    [faqStateGameId, faqs, gameId, includeFixedTeamStandingsFaq, fixedT],
  );

  const choose = (next: Selection) => {
    manualChoice.current = true;
    setSelection(next);
  };
  const refresh = () => {
    const token = epoch.current;
    void loadFaqs(gameId, selection, token);
    if (selection !== 'original') {
      pollAttempts.current = 0;
      setPollTick((value) => value + 1);
      void checkStatus(gameId, selection, token);
    }
  };
  const retry = () => {
    if (selection === 'original' || !online) return;
    void requestTranslation(gameId, selection, epoch.current, Boolean(row?.failed));
  };
  const languageName = selection === 'original' ? '' : FAQ_LANGUAGE_NAMES[selection];

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
          <label htmlFor={`faq-language-${gameId}`} className="text-sm font-medium text-gray-800 dark:text-gray-100">{t('faq.translation.readerLanguage')}</label>
          <select id={`faq-language-${gameId}`} value={selection} onChange={(event) => choose(event.target.value as Selection)} className="max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
            <option value="original">{t('faq.translation.readerOriginal')}</option>
            {APP_UI_LANGUAGES.map((locale) => <option key={locale} value={locale}>{FAQ_LANGUAGE_FLAGS[locale]} {FAQ_LANGUAGE_NAMES[locale]}</option>)}
          </select>
        </div>
      </Card>
      {!faqError && selection !== 'original' && (pending || statusError || requestError || !online || (status && !status.generationEnabled && Boolean(row?.missing || row?.stale)) || Boolean(row?.failed)) && (
        <Card>
          <div role="status" aria-live="polite" className="flex items-start gap-3 p-3 text-sm text-gray-700 dark:text-gray-200 sm:p-4">
            {pending && online && pollAttempts.current < MAX_POLL_ATTEMPTS && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-600" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              {requestError ? <p>{t('faq.translation.readerRequestError')}</p>
                : !online ? <p>{t('faq.translation.readerOffline')}</p>
                : statusError ? <p>{t('faq.translation.readerLoadError')}</p>
                : pending && pollAttempts.current >= MAX_POLL_ATTEMPTS ? <p>{t('faq.translation.readerPaused')}</p>
                : pending ? <><p>{t('faq.translation.readerTranslating', { language: languageName })}</p><p className="mt-1 text-gray-500 dark:text-gray-400">{t('faq.translation.readerWait')}</p></>
                : row?.failed ? <p>{t('faq.translation.readerFailed')}</p>
                : status && !status.generationEnabled && Boolean(row?.missing || row?.stale) ? <p>{t('faq.translation.readerUnavailable')}</p>
                : null}
              {(requestError || statusError || (pending && pollAttempts.current >= MAX_POLL_ATTEMPTS) || Boolean(row?.failed)) && <button type="button" onClick={requestError || row?.failed ? retry : refresh} disabled={!online || requesting} className="mt-2 font-medium text-primary-700 underline disabled:opacity-50 dark:text-primary-300">{requestError || row?.failed ? t('faq.translation.readerRetry') : t('faq.translation.readerRefresh')}</button>}
            </div>
          </div>
        </Card>
      )}
      {!contentLoaded && displayFaqs.length === 0 && <Card><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary-600" aria-label={t('app.loading')} /></div></Card>}
      {contentLoaded && faqError && <Card><div className="p-4 text-center text-gray-600 dark:text-gray-300"><p>{t('faq.translation.readerLoadError')}</p><button type="button" onClick={refresh} className="mt-2 font-medium text-primary-700 underline dark:text-primary-300">{t('faq.translation.readerRefresh')}</button></div></Card>}
      {contentLoaded && !faqError && displayFaqs.length === 0 && <Card><div className="py-12 text-center text-gray-500 dark:text-gray-400">{t('faq.noFaqs')}</div></Card>}
      {displayFaqs.map((faq) => {
        const expanded = expandedIds.has(faq.id);
        const showingTranslation = selection !== 'original' && faq.localizedText?.state === 'translated' && faq.localizedText.locale === selection;
        const question = showingTranslation ? faq.localizedText!.question : faq.question;
        const answer = showingTranslation ? faq.localizedText!.answer : faq.answer;
        const answerId = `faq-answer-${gameId}-${faq.id}`;
        return <Card key={faq.id} className="overflow-hidden">
          <button type="button" aria-expanded={expanded} aria-controls={answerId} onClick={() => setExpandedIds((currentIds) => {
            const next = new Set(currentIds);
            if (next.has(faq.id)) next.delete(faq.id); else next.add(faq.id);
            return next;
          })} className="flex w-full items-start gap-3 p-4 text-start transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
            <span className="mt-1 shrink-0" aria-hidden="true">{expanded ? <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />}</span>
            <h3 lang={showingTranslation ? selection : faq.id === FIXED_TEAM_STANDINGS_FAQ_ID ? fixedLocale : undefined} dir="auto" className="section-title min-w-0 flex-1 whitespace-pre-line">{question}</h3>
          </button>
          <div id={answerId} hidden={!expanded} className="mx-4 mb-4 border-t border-gray-200 pt-3 dark:border-gray-700">
            <p lang={showingTranslation ? selection : faq.id === FIXED_TEAM_STANDINGS_FAQ_ID ? fixedLocale : undefined} dir="auto" className="whitespace-pre-line text-gray-700 dark:text-gray-300">{answer}</p>
          </div>
        </Card>;
      })}
    </div>
  );
};
