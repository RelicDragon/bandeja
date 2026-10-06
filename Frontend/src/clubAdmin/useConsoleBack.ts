import { useNavigate } from 'react-router-dom';

/** History-aware back: pop when the app has history, else go to `fallback`. */
export function useConsoleBack() {
  const navigate = useNavigate();
  return (fallback: string) => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
