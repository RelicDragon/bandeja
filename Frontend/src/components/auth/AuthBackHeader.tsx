import { ArrowLeft } from 'lucide-react';

interface AuthBackHeaderProps {
  title: string;
  onBack: () => void;
  backLabel?: string;
}

export const AuthBackHeader = ({ title, onBack, backLabel }: AuthBackHeaderProps) => (
  <div className="flex items-center gap-3 mb-6">
    <button
      type="button"
      onClick={onBack}
      className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-400 transition-all -ml-1 active:scale-95"
      aria-label={backLabel ?? 'Back'}
    >
      <ArrowLeft size={20} />
    </button>
    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
      {title}
    </h2>
  </div>
);
