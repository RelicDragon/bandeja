import { watchBezel } from './watchTheme';

/** The stage's silhouette while the first live frame loads — same frame, so nothing jumps. */
export function WatchStageSkeleton({ light }: { light: boolean }) {
  const bezel = watchBezel(light);
  const block = light ? 'bg-zinc-200/80' : 'bg-white/[0.07]';
  const core = light ? 'bg-white' : 'bg-[#111113]';
  const line = light ? 'bg-zinc-900/[0.06]' : 'bg-white/[0.06]';

  const identity = (
    <div className="flex items-center gap-3.5 px-5 py-5">
      <div className="flex">
        <span className={`size-12 rounded-full ${block}`} />
        <span className={`-ms-3 size-12 rounded-full ring-[3px] ${light ? 'ring-white' : 'ring-[#111113]'} ${block}`} />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <span className={`h-3 w-32 rounded-full ${block}`} />
        <span className={`h-3 w-24 rounded-full ${block}`} />
      </div>
    </div>
  );
  const scores = (
    <div className="flex items-center justify-between">
      <div className="flex items-end gap-3">
        <span className={`h-6 w-6 rounded-lg ${block}`} />
        <span className={`h-12 w-11 rounded-xl ${block}`} />
      </div>
      <span className={`size-[5.25rem] rounded-[1.5rem] ${block}`} />
    </div>
  );

  return (
    <div
      className={`flex max-h-[50rem] min-h-[31rem] flex-1 flex-col ${bezel.shell}`}
      aria-busy
      data-testid="watch-stage-skeleton"
    >
      <div className={`flex flex-1 flex-col overflow-hidden motion-safe:animate-pulse ${bezel.core} ${core}`}>
        <div className="px-5 pt-5">
          <span className={`block h-5 w-20 rounded-full ${block}`} />
        </div>
        {identity}
        <div className="relative flex flex-1 flex-col justify-end px-5 pb-1">
          <span className={`absolute inset-x-0 top-0 h-px ${line}`} />
          {scores}
        </div>
        <div className="relative h-12">
          <span className={`absolute inset-x-5 top-1/2 h-px ${line}`} />
        </div>
        <div className="relative flex flex-1 flex-col px-5 pb-5">
          <span className={`absolute inset-x-0 bottom-0 h-px ${line}`} />
          {scores}
        </div>
        {identity}
      </div>
    </div>
  );
}
