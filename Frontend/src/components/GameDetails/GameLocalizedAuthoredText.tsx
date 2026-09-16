import type { ReactNode } from 'react';

type GameLocalizedAuthoredTextProps = {
  text: string;
  lang?: string | null;
  className?: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3';
  children?: ReactNode;
};

/** Authored/localized game text with dir=auto and optional lang. */
export function GameLocalizedAuthoredText({
  text,
  lang = null,
  className,
  as: Tag = 'span',
  children,
}: GameLocalizedAuthoredTextProps) {
  return (
    <Tag className={className} lang={lang ?? undefined} dir="auto">
      {children ?? text}
    </Tag>
  );
}
