import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import type {
  GameTextEditorFieldDto,
  GameTextEditorLocaleDto,
} from '@/utils/gameText/gameTextEditor.types';
import { initialGameTextEditorFieldDraft, shouldReseedEditorDrafts } from '@/utils/gameText/gameTextEditorDraft';
import {
  gameTextEditorLanguageLabel,
  gameTextEditorStatusI18nKey,
} from '@/utils/gameText/gameTextEditorLabels';
import { GameTextTranslationsFieldEditor } from './GameTextTranslationsFieldEditor';

type GameTextTranslationsLocaleDetailProps = {
  localeRow: GameTextEditorLocaleDto;
  saving: boolean;
  retrying: boolean;
  onBack: () => void;
  onSaveField: (
    field: 'name' | 'description',
    text: string,
  ) => Promise<GameTextEditorLocaleDto | null>;
  onClearField: (
    field: 'name' | 'description',
  ) => Promise<GameTextEditorLocaleDto | null>;
  onRetry: () => Promise<void>;
};

export function GameTextTranslationsLocaleDetail({
  localeRow,
  saving,
  retrying,
  onBack,
  onSaveField,
  onClearField,
  onRetry,
}: GameTextTranslationsLocaleDetailProps) {
  const { t } = useTranslation();
  const languageName = t(`gameDetails.gameText.editor.languages.${localeRow.locale}`, {
    defaultValue: gameTextEditorLanguageLabel(localeRow.locale),
  });

  const [draftLocale, setDraftLocale] = useState(localeRow.locale);
  const [nameDraft, setNameDraft] = useState(() =>
    initialGameTextEditorFieldDraft(localeRow.name),
  );
  const [descriptionDraft, setDescriptionDraft] = useState(() =>
    initialGameTextEditorFieldDraft(localeRow.description),
  );

  // Re-seed drafts only when opening a different language — not on conflict refresh.
  if (shouldReseedEditorDrafts(draftLocale, localeRow.locale)) {
    setDraftLocale(localeRow.locale);
    setNameDraft(initialGameTextEditorFieldDraft(localeRow.name));
    setDescriptionDraft(initialGameTextEditorFieldDraft(localeRow.description));
  }

  const afterClear = (
    field: 'name' | 'description',
    updated: GameTextEditorLocaleDto | null,
  ) => {
    if (!updated) return;
    const next: GameTextEditorFieldDto = updated[field];
    if (field === 'name') setNameDraft(initialGameTextEditorFieldDraft(next));
    else setDescriptionDraft(initialGameTextEditorFieldDraft(next));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-50">
            {languageName}
          </h3>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            {t(gameTextEditorStatusI18nKey(localeRow.status))}
          </p>
        </div>
        {localeRow.status === 'retry' ? (
          <button
            type="button"
            disabled={retrying || saving}
            onClick={() => void onRetry()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium dark:border-gray-600"
          >
            {retrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('gameDetails.gameText.editor.retry')}
          </button>
        ) : null}
      </div>

      <GameTextTranslationsFieldEditor
        field={localeRow.name}
        draft={nameDraft}
        onDraftChange={setNameDraft}
        originalLabel={t('gameDetails.gameText.editor.originalName')}
        translationLabel={t('gameDetails.gameText.editor.translatedName')}
        saving={saving}
        onSave={async (text) => {
          await onSaveField('name', text);
        }}
        onUseAutomatic={async () => {
          const updated = await onClearField('name');
          afterClear('name', updated);
        }}
      />
      <GameTextTranslationsFieldEditor
        field={localeRow.description}
        draft={descriptionDraft}
        onDraftChange={setDescriptionDraft}
        originalLabel={t('gameDetails.gameText.editor.originalDescription')}
        translationLabel={t('gameDetails.gameText.editor.translatedDescription')}
        saving={saving}
        onSave={async (text) => {
          await onSaveField('description', text);
        }}
        onUseAutomatic={async () => {
          const updated = await onClearField('description');
          afterClear('description', updated);
        }}
      />
    </div>
  );
}
