import { isCurrentStagingDeployment } from '@/config/deploymentEnvironment';

export function StagingEnvironmentBanner() {
  if (!isCurrentStagingDeployment()) return null;

  return (
    <aside
      aria-label="Staging environment"
      className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] flex min-h-8 items-center justify-center gap-2 border-b-2 border-black bg-amber-300 px-2 py-1 text-center text-[10px] font-black uppercase leading-4 tracking-[0.12em] text-black shadow-lg sm:text-xs sm:tracking-[0.18em]"
      data-testid="staging-environment-banner"
      data-vite-mode={import.meta.env.MODE}
      role="status"
    >
      <span className="rounded-sm bg-black px-2 py-0.5 text-amber-300">Beta</span>
      <span>Staging environment</span>
      <span aria-hidden="true">•</span>
      <span>Not production</span>
    </aside>
  );
}
