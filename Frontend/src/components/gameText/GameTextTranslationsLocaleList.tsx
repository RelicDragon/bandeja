import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { GameTextEditorLocaleDto } from '@/utils/gameText/gameTextEditor.types';
import {
  gameTextEditorLanguageLabel,
  gameTextEditorStatusI18nKey,
} from '@/utils/gameText/gameTextEditorLabels';

type GameTextTranslationsLocaleListProps = {
  locales: GameTextEditorLocaleDto[];
  onSelect: (locale: GameTextEditorLocaleDto) => void;
};

export function GameTextTranslationsLocaleList({
  locales,
  onSelect,
}: GameTextTranslationsLocaleListProps) {
  const { t } = useTranslation();

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {locales.map((localeRow) => (
        <li key={localeRow.locale}>
          <button
            type="button"
            onClick={() => onSelect(localeRow)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {t(`gameDetails.gameText.editor.languages.${localeRow.locale}`, {
                  defaultValue: gameTextEditorLanguageLabel(localeRow.locale),
                })}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t(gameTextEditorStatusI18nKey(localeRow.status))}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
