interface BetResultBadgeProps {
  isWinner: boolean;
}

export const BetResultBadge = ({ isWinner }: BetResultBadgeProps) => {

  return (
    <span className={`absolute -top-2 -right-2 text-xs font-semibold px-2 py-1 rounded-full shadow-lg ${
      isWinner
        ? 'bg-green-600 text-white dark:bg-green-500 shadow-green-500/50'
        : 'bg-red-600 text-white dark:bg-red-500 shadow-red-500/50'
    }`}>
      {isWinner ? 'W' : 'L'}
    </span>
  );
};
