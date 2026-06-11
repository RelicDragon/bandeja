import { Card } from '@/components';

const shimmerBlock =
  'relative overflow-hidden rounded-lg bg-gray-200/80 dark:bg-gray-800 ' +
  'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer ' +
  'after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent ' +
  'dark:after:via-white/10';

export const GameDetailsSkeleton = () => (
  <div className="max-w-2xl mx-auto space-y-4 p-0" aria-busy="true">
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className={`h-6 w-3/5 ${shimmerBlock}`} />
            <div className="flex gap-2">
              <div className={`h-6 w-16 rounded-full ${shimmerBlock}`} />
              <div className={`h-6 w-20 rounded-full ${shimmerBlock}`} />
            </div>
          </div>
          <div className={`h-10 w-10 rounded-xl ${shimmerBlock}`} />
        </div>
        <div className="space-y-3">
          <div className={`h-4 w-2/5 ${shimmerBlock}`} />
          <div className={`h-4 w-1/2 ${shimmerBlock}`} />
          <div className={`h-4 w-1/3 ${shimmerBlock}`} />
        </div>
      </div>
    </Card>

    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className={`h-5 w-1/3 ${shimmerBlock}`} />
          <div className={`h-8 w-16 rounded-xl ${shimmerBlock}`} />
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className={`h-14 w-14 rounded-full ${shimmerBlock}`} />
              <div className={`h-3 w-12 ${shimmerBlock}`} />
            </div>
          ))}
        </div>
      </div>
    </Card>

    <Card className="p-4">
      <div className="space-y-3">
        <div className={`h-5 w-2/5 ${shimmerBlock}`} />
        <div className={`h-10 w-full ${shimmerBlock}`} />
      </div>
    </Card>

    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className={`h-5 w-1/3 ${shimmerBlock}`} />
        <div className={`h-9 w-24 rounded-xl ${shimmerBlock}`} />
      </div>
    </Card>
  </div>
);
