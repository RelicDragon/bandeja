import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type GameResultStorySummaryProps = {
  text: string;
};

export function GameResultStorySummary({ text }: GameResultStorySummaryProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-white/20 bg-black/25 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/25">
          <ScrollText size={14} className="text-white/85" strokeWidth={2.25} />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
          {t('stories.resultSummary')}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/90">{text}</p>
    </section>
  );
}
