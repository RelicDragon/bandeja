import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { SPORT_QUESTIONNAIRE_I18N_KEY } from '@/sport/sportQuestionnaireRegistry';
import { WelcomeOptionCard } from '@/components/welcome/WelcomeOptionCard';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

type SportQuestionnaireQuestionProps = {
  sport: Sport;
  questionKey: string;
  index: number;
  selectedOption: string | undefined;
  onSelect: (option: string) => void;
};

export function SportQuestionnaireQuestion({
  sport,
  questionKey,
  index,
  selectedOption,
  onSelect,
}: SportQuestionnaireQuestionProps) {
  const { t } = useTranslation();
  const sportNs = SPORT_QUESTIONNAIRE_I18N_KEY[sport];
  const base = `sportQuestionnaire.${sportNs}.${questionKey}`;
  const name = `${sportNs}-q${index}`;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {index + 1}. {t(`${base}`)}
      </legend>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <WelcomeOptionCard
            key={opt}
            option={opt}
            label={t(`${base}${opt.toLowerCase()}`)}
            name={name}
            checked={selectedOption === opt}
            onSelect={() => onSelect(opt)}
          />
        ))}
      </div>
    </fieldset>
  );
}
