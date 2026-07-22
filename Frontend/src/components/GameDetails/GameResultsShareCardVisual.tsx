import type { CSSProperties, Ref } from 'react';

/** Hex/rgba only — html2canvas 1.4 throws on Tailwind 4 oklch/oklab/color-mix. */
const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '24rem',
  overflow: 'hidden',
  borderRadius: '1rem',
  border: '1px solid rgba(167, 139, 250, 0.3)',
  background: 'linear-gradient(to bottom right, #0f172a, #2e1065, #0f172a)',
  padding: '1rem',
  color: '#ffffff',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
};

const badgeStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#c4b5fd',
};

const titleStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '1.125rem',
  fontWeight: 700,
  lineHeight: 1.25,
};

const sportPillStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 9999,
  background: 'rgba(139, 92, 246, 0.2)',
  padding: '0.125rem 0.5rem',
  fontSize: 10,
  fontWeight: 500,
  color: '#ddd6fe',
};

const photoStyle: CSSProperties = {
  marginTop: '0.75rem',
  aspectRatio: '4 / 3',
  width: '100%',
  borderRadius: '0.75rem',
  objectFit: 'cover',
  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1)',
};

const summaryStyle: CSSProperties = {
  margin: '0.75rem 0 0',
  fontSize: '0.875rem',
  lineHeight: 1.5,
  color: '#e2e8f0',
  display: '-webkit-box',
  WebkitLineClamp: 6,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const emptySummaryStyle: CSSProperties = {
  ...summaryStyle,
  color: '#94a3b8',
};

export type GameResultsShareCardVisualProps = {
  cardRef?: Ref<HTMLDivElement>;
  badgeLabel: string;
  title: string;
  sportLabel: string;
  photoUrl: string | null;
  summary: string | null;
  noSummaryLabel: string;
};

export function GameResultsShareCardVisual({
  cardRef,
  badgeLabel,
  title,
  sportLabel,
  photoUrl,
  summary,
  noSummaryLabel,
}: GameResultsShareCardVisualProps) {
  return (
    <div ref={cardRef} data-testid="game-results-share-card" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ minWidth: 0 }}>
          <p style={badgeStyle}>{badgeLabel}</p>
          <h3 style={titleStyle}>{title}</h3>
        </div>
        <span style={sportPillStyle}>{sportLabel}</span>
      </div>
      {photoUrl ? (
        <img src={photoUrl} alt="" style={photoStyle} crossOrigin="anonymous" />
      ) : null}
      {summary ? (
        <p style={summaryStyle}>{summary}</p>
      ) : (
        <p style={emptySummaryStyle}>{noSummaryLabel}</p>
      )}
    </div>
  );
}
