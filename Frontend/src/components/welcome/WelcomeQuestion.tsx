import { useTranslation } from 'react-i18next';
import { WelcomeOptionCard } from './WelcomeOptionCard';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

interface WelcomeQuestionProps {
  questionKey: string;
  index: number;
  selectedOption: string | undefined;
  onSelect: (option: string) => void;
}

export const WelcomeQuestion = ({
  questionKey,
  index,
  selectedOption,
  onSelect,
}: WelcomeQuestionProps) => {
  const { t } = useTranslation();
  const name = `q${index}`;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {index + 1}. {t(`welcome.${questionKey}`)}
      </legend>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <WelcomeOptionCard
            key={opt}
            option={opt}
            label={t(`welcome.${questionKey}${opt.toLowerCase()}`)}
            name={name}
            checked={selectedOption === opt}
            onSelect={() => onSelect(opt)}
          />
        ))}
      </div>
    </fieldset>
  );
};
