interface FormFieldProps {
  label?: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
}

const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

export const FormField = ({ label, required, children, error }: FormFieldProps) => (
  <div className="w-full">
    {label ? (
      <label className={LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    ) : null}
    {children}
    {error && <p className="mt-1.5 text-sm text-red-500 dark:text-red-400">{error}</p>}
  </div>
);
