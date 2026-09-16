import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { Loader2, X } from 'lucide-react';
import { gamesApi } from '@/api';
import { useDesktop } from '@/hooks/useDesktop';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import type {
  GameTextEditorLocaleDto,
  GameTextTranslationsEditorDto,
} from '@/utils/gameText/gameTextEditor.types';
import { GameTextTranslationsLocaleList } from './GameTextTranslationsLocaleList';
import { GameTextTranslationsLocaleDetail } from './GameTextTranslationsLocaleDetail';
import {
  GAME_TEXT_PENDING_POLL_INTERVAL_MS,
  GAME_TEXT_PENDING_POLL_MAX_ATTEMPTS,
} from '@/utils/gameText/gameTextPendingPoll';
import { useNetworkStore } from '@/utils/networkStatus';

type GameTextTranslationsPanelProps = {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
  onPolicyUpdated?: () => void;
};

export function GameTextTranslationsPanel({
  gameId,
  isOpen,
  onClose,
  onPolicyUpdated,
}: GameTextTranslationsPanelProps) {
  const { t } = useTranslation();
  const isDesktop = useDesktop();
  const useDialog = isDesktop;
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [data, setData] = useState<GameTextTranslationsEditorDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GameTextEditorLocaleDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);

  useBackButtonModal(isOpen, onClose, `game-text-translations-${gameId}`);

  const applyTranslationsPayload = useCallback((payload: GameTextTranslationsEditorDto) => {
    setData(payload);
    setSelected((prev) => {
      if (!prev) return null;
      return payload.locales.find((l) => l.locale === prev.locale) ?? null;
    });
  }, []);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = opts?.quiet === true;
      if (!quiet) setLoading(true);
      try {
        const res = await gamesApi.getTranslations(gameId);
        applyTranslationsPayload(res.data);
      } catch (err) {
        const message = isAxiosError(err)
          ? err.response?.data?.message || t('errors.generic')
          : t('errors.generic');
        toast.error(t(message, { defaultValue: String(message) }));
        if (!quiet) onClose();
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [applyTranslationsPayload, gameId, onClose, t],
  );

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setSelected(null);
      return;
    }
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, selected]);

  const hasUpdatingLocale = Boolean(
    data?.locales.some((l) => l.status === 'updating' || l.status === 'retry'),
  );

  useEffect(() => {
    if (!isOpen || !isOnline || !hasUpdatingLocale) return;
    let attempts = 0;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > GAME_TEXT_PENDING_POLL_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        return;
      }
      void load({ quiet: true });
    }, GAME_TEXT_PENDING_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, isOnline, hasUpdatingLocale, load]);

  const patchField = async (
    locale: string,
    field: 'name' | 'description',
    action: 'set' | 'clear',
    text?: string,
  ): Promise<GameTextEditorLocaleDto | null> => {
    if (!data) return null;
    const localeRow = data.locales.find((l) => l.locale === locale);
    if (!localeRow) return null;
    const fieldDto = localeRow[field];
    setSaving(true);
    try {
      const res = await gamesApi.patchTranslationLocale(gameId, locale, {
        [field]: {
          action,
          ...(action === 'set' ? { text } : {}),
          expectedSourceRevision: fieldDto.sourceRevision,
          expectedRecordRevision: fieldDto.recordRevision,
        },
      });
      applyTranslationsPayload(res.data);
      return res.data.locales.find((l) => l.locale === locale) ?? null;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        // Quiet refresh updates original/revisions; LocaleDetail keeps textarea drafts.
        toast.error(t('gameDetails.gameText.editor.conflict'));
        await load({ quiet: true });
        return null;
      }
      const message = isAxiosError(err)
        ? err.response?.data?.message || t('errors.generic')
        : t('errors.generic');
      toast.error(t(message, { defaultValue: String(message) }));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onRetry = async () => {
    if (!selected) return;
    setRetrying(true);
    try {
      await gamesApi.retryTranslationLocale(gameId, selected.locale);
      toast.success(t('gameDetails.gameText.editor.retryQueued'));
      await load({ quiet: true });
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.message || t('errors.generic')
        : t('errors.generic');
      toast.error(t(message, { defaultValue: String(message) }));
    } finally {
      setRetrying(false);
    }
  };

  const toggleKeepOriginalName = async (next: boolean) => {
    setPolicySaving(true);
    try {
      await gamesApi.update(gameId, { keepOriginalNameInAllLocales: next });
      onPolicyUpdated?.();
      await load({ quiet: true });
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.message || t('errors.generic')
        : t('errors.generic');
      toast.error(t(message, { defaultValue: String(message) }));
    } finally {
      setPolicySaving(false);
    }
  };

  if (!isOpen) return null;

  const body = (
    <div
      className={
        useDialog
          ? 'fixed inset-0 z-[220] flex items-end justify-center p-0 sm:items-center sm:p-4'
          : 'fixed inset-0 z-[220] flex items-end justify-center'
      }
    >
      <button
        type="button"
        className="absolute inset-0 z-0 border-0 bg-black/45 p-0 dark:bg-black/60"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('gameDetails.gameText.editor.title')}
        className={[
          'relative z-[1] flex w-full max-h-[min(92dvh,720px)] flex-col overflow-hidden rounded-t-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900',
          useDialog ? 'sm:max-w-xl sm:rounded-2xl' : 'max-w-2xl',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-50">
              {t('gameDetails.gameText.editor.title')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t('gameDetails.gameText.editor.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading || !data ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : selected ? (
            <GameTextTranslationsLocaleDetail
              localeRow={selected}
              saving={saving}
              retrying={retrying}
              onBack={() => setSelected(null)}
              onSaveField={(field, text) => patchField(selected.locale, field, 'set', text)}
              onClearField={(field) => patchField(selected.locale, field, 'clear')}
              onRetry={onRetry}
            />
          ) : (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200/80 p-3 dark:border-gray-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={data.meta.keepOriginalNameInAllLocales}
                  disabled={policySaving}
                  onChange={(e) => void toggleKeepOriginalName(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('gameDetails.gameText.editor.keepOriginalName')}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {t('gameDetails.gameText.editor.keepOriginalNameHint')}
                  </span>
                </span>
              </label>
              <GameTextTranslationsLocaleList
                locales={data.locales}
                onSelect={setSelected}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
