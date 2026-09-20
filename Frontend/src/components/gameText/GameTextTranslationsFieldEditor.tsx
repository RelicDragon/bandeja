import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { GameTextEditorFieldDto } from '@/utils/gameText/gameTextEditor.types';
import { initialGameTextEditorFieldDraft } from '@/utils/gameText/gameTextEditorDraft';
import { ExpandableTextarea } from '@/components/ui/ExpandableTextarea';

type GameTextTranslationsFieldEditorProps = {
  field: GameTextEditorFieldDto;
  draft: string;
  onDraftChange: (text: string) => void;
  originalLabel: string;
  translationLabel: string;
  disabled?: boolean;
  saving?: boolean;
  onSave: (text: string) => Promise<void>;
  onUseAutomatic: () => Promise<void>;
};

export function GameTextTranslationsFieldEditor({
  field,
  draft,
  onDraftChange,
  originalLabel,
  translationLabel,
  disabled = false,
  saving = false,
  onSave,
  onUseAutomatic,
}: GameTextTranslationsFieldEditorProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (field.preserveAsOriginal || field.original == null) {
    return (
      <div className="space-y-2 rounded-xl border border-gray-200/80 p-3 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {translationLabel}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300" dir="auto">
          {field.original ?? t('gameDetails.gameText.editor.emptyField')}
        </p>
        {field.preserveAsOriginal ? (
          <p className="text-xs text-gray-500">
            {t('gameDetails.gameText.editor.namePreservedHint')}
          </p>
        ) : null}
      </div>
    );
  }

  const baseline = initialGameTextEditorFieldDraft(field);
  const dirty = draft !== baseline;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-gray-200/80 p-3 dark:border-gray-700">
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            {originalLabel}
          </p>
          <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200" dir="auto">
            {field.original}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            {translationLabel}
          </p>
          <ExpandableTextarea
            value={draft}
            onValueChange={onDraftChange}
            fullscreenTitle={translationLabel}
            disabled={disabled || busy || saving}
            rows={field.field === 'description' ? 5 : 2}
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            dir="auto"
          />
        </div>
      </div>
      {field.needsReview ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t('gameDetails.gameText.editor.needsReviewHint')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy || saving || !dirty || !draft.trim()}
          onClick={() => void run(() => onSave(draft))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {(busy || saving) && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t('common.save')}
        </button>
        {field.hasActiveCorrection || field.needsReview ? (
          <button
            type="button"
            disabled={disabled || busy || saving}
            onClick={() => void run(onUseAutomatic)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('gameDetails.gameText.editor.useAutomatic')}
          </button>
        ) : null}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        {t('gameDetails.gameText.editor.useAutomaticHint')}
      </p>
    </div>
  );
}
