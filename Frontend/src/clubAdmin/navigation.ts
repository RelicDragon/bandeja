import { Variants } from 'framer-motion';

export const CLUB_ADMIN_PAGE_VARIANTS: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '28%' : '-28%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-28%' : '28%',
    opacity: 0,
  }),
};

export const CLUB_ADMIN_PAGE_TRANSITION = {
  duration: 0.24,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
};

export function clubAdminRouteKey(pathname: string): string {
  return pathname.replace(/^\/my-clubs\/?/, '') || 'index';
}
