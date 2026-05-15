import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface ClubAdminLayoutProps {
  title: string;
  backTo?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function ClubAdminLayout({ title, backTo, children, actions }: ClubAdminLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          className="rounded-full p-2 hover:bg-muted"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
        {actions}
      </header>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}
