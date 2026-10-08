import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { MemberThemeId } from '@/utils/mainTheme';
import {
  CELEBRATION_MAX_MS,
  buildCelebrationParticles,
  celebrationFor,
  type CelebrationSurface,
} from './memberEffectsConfig';
import { MemberParticleShape } from './MemberParticleShape';
import './memberEffects.css';

type MemberCelebrationBurstProps = {
  theme: MemberThemeId;
  reduceMotion: boolean;
  /**
   * Surface the burst plays over. `page` follows the app appearance (`html.dark`);
   * `dark` is for always-dark scrims such as the novice rank-up overlay.
   */
  surface?: 'page' | 'dark';
  /** Largest travel from the centre, px. */
  radius?: number;
};

function resolveSurface(surface: 'page' | 'dark'): CelebrationSurface {
  if (surface === 'dark') return 'dark';
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Themed one-shot burst for member themes: ≤ 40 particles, CSS keyframes on
 * transform/opacity, gone after 1.8 s. Reduced motion → one static themed glyph
 * beside the centre (the hero art sits there) that fades in and out. Fills its
 * (relative) parent and never takes input.
 */
export function MemberCelebrationBurst({ theme, reduceMotion, surface = 'page', radius = 110 }: MemberCelebrationBurstProps) {
  const config = celebrationFor(theme);
  const resolved = resolveSurface(surface);
  const particles = useMemo(
    () => (config && !reduceMotion ? buildCelebrationParticles(config, resolved, radius) : []),
    [config, reduceMotion, resolved, radius],
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDone(true), CELEBRATION_MAX_MS + 100);
    return () => window.clearTimeout(timer);
  }, []);

  if (!config || done) return null;

  if (reduceMotion) {
    const color = (resolved === 'dark' ? config.onDark : config.onLight)[0];
    return (
      <div
        className="mfx-burst"
        data-testid="member-celebration"
        data-member-effect={theme}
        data-reduced-motion="true"
        aria-hidden
      >
        <span
          className="mfx-static-glyph"
          style={{ color, '--mfx-x': `${Math.round(radius * 0.72)}px`, '--mfx-y': `${-Math.round(radius * 0.72)}px` } as CSSProperties}
        >
          <MemberParticleShape shape={config.glyph} />
        </span>
      </div>
    );
  }

  return (
    <div className="mfx-burst" data-testid="member-celebration" data-member-effect={theme} aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className={`mfx-particle mfx-particle--${p.motion}`}
          data-shape={p.shape}
          style={
            {
              color: p.color,
              width: p.size,
              height: p.size,
              '--mfx-x': `${p.x}px`,
              '--mfx-y': `${p.y}px`,
              '--mfx-r': `${p.rotate}deg`,
              animationDelay: `${p.delayMs}ms`,
              animationDuration: `${p.durationMs}ms`,
            } as CSSProperties
          }
        >
          <MemberParticleShape shape={p.shape} />
        </span>
      ))}
    </div>
  );
}
