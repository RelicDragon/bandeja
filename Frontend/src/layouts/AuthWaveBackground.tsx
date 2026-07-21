import { useEffect, useRef, useMemo, useState } from 'react';
import './AuthWaveBackground.css';

type WaveLayer = {
  color: string;
  darkColor: string;
  baseAmp: number;
  ampPulse: number;
  wavelength: number;
  speed: number;
  yRatio: number;
  phase: number;
};

const LAYERS: WaveLayer[] = [
  { color: 'rgba(125, 211, 252, 0.55)', darkColor: 'rgba(56, 189, 248, 0.35)', baseAmp: 0.11, ampPulse: 0.03, wavelength: 0.55, speed: 0.035, yRatio: 0.42, phase: 0.2 },
  { color: 'rgba(56, 189, 248, 0.6)', darkColor: 'rgba(14, 165, 233, 0.4)', baseAmp: 0.13, ampPulse: 0.035, wavelength: 0.7, speed: -0.045, yRatio: 0.5, phase: 1.1 },
  { color: 'rgba(14, 165, 233, 0.7)', darkColor: 'rgba(2, 132, 199, 0.5)', baseAmp: 0.15, ampPulse: 0.04, wavelength: 0.9, speed: 0.06, yRatio: 0.58, phase: 2.4 },
  { color: 'rgba(2, 132, 199, 0.55)', darkColor: 'rgba(3, 105, 161, 0.55)', baseAmp: 0.1, ampPulse: 0.025, wavelength: 1.15, speed: -0.028, yRatio: 0.68, phase: 3.6 },
];

/** Target canvas fps — full 60fps is unnecessary and heats phones. */
const WAVE_FPS = 20;
const FRAME_MS = 1000 / WAVE_FPS;

type Star = {
  left: string;
  top: string;
  size: number;
  opacity: number;
  delay?: string;
  duration?: string;
  twinkle: boolean;
};

function buildStars(count: number): Star[] {
  const stars: Star[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < count; i += 1) {
    const yNorm = rand();
    const top = Math.pow(yNorm, 1.35) * 55;
    const twinkle = i % 3 === 0;
    stars.push({
      left: `${rand() * 100}%`,
      top: `${top}%`,
      size: 0.9 + rand() * 2.1,
      opacity: 0.25 + rand() * 0.7,
      delay: twinkle ? `${rand() * 4}s` : undefined,
      duration: twinkle ? `${3.5 + rand() * 4}s` : undefined,
      twinkle,
    });
  }
  return stars;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

type DriftCloud = {
  shape: 1 | 2 | 3 | 4 | 5;
  width: number;
  height: number;
  gap: number;
  lift: number;
};

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildCloudLane(seed: number, count: number, sizeScale: number): DriftCloud[] {
  const rand = seededRand(seed);
  const clouds: DriftCloud[] = [];
  for (let i = 0; i < count; i += 1) {
    const scale = (0.55 + rand() * 0.9) * sizeScale;
    clouds.push({
      shape: (1 + Math.floor(rand() * 5)) as DriftCloud['shape'],
      width: 2.6 + scale * 3.4,
      height: 0.95 + scale * 0.95,
      gap: 5.5 + rand() * 12,
      lift: -1.2 + rand() * 2.4,
    });
  }
  return clouds;
}

function CloudStrip({ clouds }: { clouds: DriftCloud[] }) {
  return (
    <div className="auth-wave-bg__cloud-set">
      {clouds.map((cloud, i) => (
        <span
          key={i}
          className={`auth-wave-bg__cloud auth-wave-bg__cloud--s${cloud.shape}`}
          style={{
            width: `${cloud.width}rem`,
            height: `${cloud.height}rem`,
            marginLeft: `${cloud.gap}rem`,
            marginBottom: `${cloud.lift}rem`,
          }}
        />
      ))}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => (typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true),
  );

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return visible;
}

export function AuthWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const docVisible = useDocumentVisible();
  const animate = docVisible && !reducedMotion;

  const stars = useMemo(() => buildStars(36), []);
  const laneA = useMemo(() => buildCloudLane(4201, 5, 1.35), []);
  const laneB = useMemo(() => buildCloudLane(8831, 4, 0.95), []);
  const laneC = useMemo(() => buildCloudLane(2711, 4, 0.55), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let dark = isDarkMode();
    let running = true;
    let lastPaint = 0;
    let step = 8;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      // Cap DPR hard — retina full-res canvas is a major heat source
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      width = parent.clientWidth;
      height = Math.round(Math.min(window.innerHeight * 0.52, 460));
      step = width < 480 ? 10 : 8;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawLayer = (layer: WaveLayer, timeSec: number) => {
      const amp =
        height *
        (layer.baseAmp + layer.ampPulse * Math.sin(timeSec * 0.55 + layer.phase));
      const baseline = height * layer.yRatio;
      const k = (Math.PI * 2) / (width * layer.wavelength);
      const drift = timeSec * layer.speed * width;
      const form = 0.35 * Math.sin(timeSec * 0.4 + layer.phase * 0.7);

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += step) {
        const y =
          baseline +
          amp * Math.sin(k * (x + drift) + layer.phase) +
          amp * 0.35 * Math.sin(k * 1.7 * (x + drift * 0.85) + layer.phase + form);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = dark ? layer.darkColor : layer.color;
      ctx.fill();
    };

    const paint = (timeSec: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const layer of LAYERS) {
        drawLayer(layer, timeSec);
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      if (now - lastPaint >= FRAME_MS) {
        lastPaint = now;
        paint(now / 1000);
      }
      raf = requestAnimationFrame(loop);
    };

    resize();
    paint(performance.now() / 1000);

    if (animate) {
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => {
      resize();
      paint(performance.now() / 1000);
    };

    const themeObserver = new MutationObserver(() => {
      dark = isDarkMode();
      paint(performance.now() / 1000);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      themeObserver.disconnect();
    };
  }, [animate]);

  return (
    <div
      className={`auth-wave-bg${animate ? '' : ' auth-wave-bg--paused'}`}
      aria-hidden="true"
    >
      <div className="auth-wave-bg__base" />

      <div className="auth-wave-bg__sky">
        <div className="auth-wave-bg__sun-tint" />
        <div className="auth-wave-bg__clouds">
          <div className="auth-wave-bg__cloud-lane auth-wave-bg__cloud-lane--c">
            <CloudStrip clouds={laneC} />
            <CloudStrip clouds={laneC} />
          </div>
          <div className="auth-wave-bg__cloud-lane auth-wave-bg__cloud-lane--b">
            <CloudStrip clouds={laneB} />
            <CloudStrip clouds={laneB} />
          </div>
          <div className="auth-wave-bg__cloud-lane auth-wave-bg__cloud-lane--a">
            <CloudStrip clouds={laneA} />
            <CloudStrip clouds={laneA} />
          </div>
        </div>
      </div>

      <div className="auth-wave-bg__stars">
        {stars.map((star, i) => (
          <span
            key={i}
            className={
              star.twinkle
                ? 'auth-wave-bg__star auth-wave-bg__star--twinkle'
                : 'auth-wave-bg__star'
            }
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              ...(star.twinkle
                ? { animationDelay: star.delay, animationDuration: star.duration }
                : null),
            }}
          />
        ))}
      </div>

      <div className="auth-wave-bg__orb auth-wave-bg__orb--a" />
      <div className="auth-wave-bg__orb auth-wave-bg__orb--b" />

      <canvas ref={canvasRef} className="auth-wave-bg__canvas" />
    </div>
  );
}
