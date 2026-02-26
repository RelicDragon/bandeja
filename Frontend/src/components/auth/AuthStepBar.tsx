interface AuthStepBarProps {
  steps: number;
  current: number;
}

export const AuthStepBar = ({ steps, current }: AuthStepBarProps) => {
  const progress = ((current + 1) / steps) * 100;
  return (
    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
      <div
        className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};
