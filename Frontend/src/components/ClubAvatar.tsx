import type { Club } from '@/types';

const PALETTES: { bg: string; fg: string }[] = [
  { bg: 'bg-violet-500', fg: 'text-white' },
  { bg: 'bg-fuchsia-500', fg: 'text-white' },
  { bg: 'bg-sky-500', fg: 'text-white' },
  { bg: 'bg-emerald-500', fg: 'text-white' },
  { bg: 'bg-rose-500', fg: 'text-white' },
  { bg: 'bg-indigo-500', fg: 'text-white' },
  { bg: 'bg-teal-500', fg: 'text-white' },
  { bg: 'bg-orange-500', fg: 'text-white' },
  { bg: 'bg-cyan-600', fg: 'text-white' },
  { bg: 'bg-pink-500', fg: 'text-white' },
  { bg: 'bg-lime-600', fg: 'text-gray-950' },
  { bg: 'bg-amber-500', fg: 'text-gray-950' },
];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paletteForClub(club: Pick<Club, 'name'> & { id?: string }) {
  const seed = `${club.id ?? ''}\0${club.name}`;
  return PALETTES[hashSeed(seed) % PALETTES.length];
}

function firstSymbolFromName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const ch = [...t][0] ?? '?';
  return /\p{L}/u.test(ch) ? ch.toLocaleUpperCase('und') : ch;
}

type ClubAvatarClub = Pick<Club, 'avatar' | 'name'> & { id?: string };

type ClubAvatarProps = {
  club: ClubAvatarClub;
  className?: string;
  variant?: 'card' | 'tile';
  fallbackLetterClassName?: string;
};

export function ClubAvatar({ club, className = '', variant = 'card', fallbackLetterClassName }: ClubAvatarProps) {
  const hasAvatar = !!club.avatar?.trim();
  const letter = firstSymbolFromName(club.name ?? '');
  const { bg, fg } = paletteForClub(club);
  const letterClass =
    fallbackLetterClassName ??
    (variant === 'tile' ? 'text-base font-semibold' : 'text-xl font-semibold');

  const placeholder = (
    <div className={`absolute inset-0 flex items-center justify-center ${bg} ${fg}`}>
      <span className={`leading-none ${letterClass}`}>{letter}</span>
    </div>
  );

  if (variant === 'tile') {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`.trim()}>
        {hasAvatar ? <img src={club.avatar!} alt="" className="h-full w-full object-cover" /> : placeholder}
      </div>
    );
  }

  const shell = `relative shrink-0 overflow-hidden rounded-xl shadow-md aspect-[4/3] bg-gray-200 dark:bg-gray-700 ${className}`.trim();

  return (
    <div className={shell}>
      {hasAvatar ? <img src={club.avatar!} alt="" className="absolute inset-0 h-full w-full object-cover" /> : placeholder}
    </div>
  );
}
