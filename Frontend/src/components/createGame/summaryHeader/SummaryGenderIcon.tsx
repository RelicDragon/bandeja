import type { GenderTeam } from '@/types';
import 'bootstrap-icons/font/bootstrap-icons.css';

export function SummaryGenderIcon({ genderTeams }: { genderTeams: GenderTeam }) {
  const className = 'text-gray-500 dark:text-gray-400';
  if (genderTeams === 'MIX_PAIRS') {
    return (
      <span className={`inline-flex items-center gap-0.5 ${className}`}>
        <i className="bi bi-gender-male text-[10px]" aria-hidden />
        <i className="bi bi-gender-female -ml-0.5 text-[10px]" aria-hidden />
      </span>
    );
  }
  if (genderTeams === 'MEN' || genderTeams === 'WOMEN') {
    return (
      <i
        className={`bi ${genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-xs ${className}`}
        aria-hidden
      />
    );
  }
  return null;
}
