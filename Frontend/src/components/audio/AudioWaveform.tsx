import React, { useRef, useEffect, useState } from 'react';

interface AudioWaveformProps {
  levels: number[];
  playedRatio?: number;
  variant: 'live' | 'playback';
  isOwn?: boolean;
  barCount?: number;
  height?: number;
  className?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  levels,
  playedRatio = 0,
  variant,
  isOwn = false,
  barCount = 48,
  height = 36,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [layoutGen, setLayoutGen] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLayoutGen((g) => g + 1));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = canvas.clientWidth || wrapRef.current?.clientWidth || 200;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const data = levels.length ? levels : Array.from({ length: barCount }, () => 0.1);
    const step = w / Math.max(data.length, barCount);
    const barW = Math.max(2, step * 0.55);
    const playedX = playedRatio * w;
    for (let i = 0; i < data.length; i++) {
      const x = i * step + (step - barW) / 2;
      const amp = Math.max(0.08, Math.min(1, data[i] ?? 0));
      const barH = amp * (h - 8);
      const y = (h - barH) / 2;
      const unplayed = x + barW / 2 > playedX;
      if (variant === 'live') {
        ctx.fillStyle = isOwn ? 'rgba(255,255,255,0.9)' : 'rgba(59,130,246,0.85)';
      } else {
        ctx.fillStyle = isOwn
          ? unplayed
            ? 'rgba(255,255,255,0.45)'
            : 'rgba(255,255,255,0.95)'
          : unplayed
            ? 'rgba(59,130,246,0.35)'
            : 'rgba(37,99,235,0.95)';
      }
      ctx.fillRect(x, y, barW, barH);
    }
  }, [levels, playedRatio, variant, isOwn, height, barCount, layoutGen]);

  return (
    <div ref={wrapRef} className={`w-full min-w-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className="block w-full min-w-0"
        style={{ height, minWidth: variant === 'playback' ? 120 : 0 }}
        aria-hidden
      />
    </div>
  );
};
