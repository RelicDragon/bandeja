interface WavyDotsProps {
  className?: string;
  dotClassName?: string;
}

export function WavyDots({
  className = 'text-gray-500 dark:text-gray-400',
  dotClassName = 'h-2 w-2',
}: WavyDotsProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      <span className={`rounded-full bg-current opacity-70 wavy-dot-1 ${dotClassName}`} />
      <span className={`rounded-full bg-current opacity-70 wavy-dot-2 ${dotClassName}`} />
      <span className={`rounded-full bg-current opacity-70 wavy-dot-3 ${dotClassName}`} />
    </span>
  );
}
