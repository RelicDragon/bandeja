import sharp from 'sharp';

export type BracketSummaryImageLabels = {
  leagueName: string;
  championLabel: string;
  finalistLabel: string;
  thirdPlaceLabel?: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export async function generateBracketSummaryImage(
  labels: BracketSummaryImageLabels
): Promise<Buffer> {
  const width = 720;
  const lineHeight = 36;
  const pad = 32;
  const rows = [
    { emoji: '🏆', title: 'Champion', value: labels.championLabel },
    { emoji: '🥈', title: 'Finalist', value: labels.finalistLabel },
    ...(labels.thirdPlaceLabel
      ? [{ emoji: '🥉', title: 'Third place', value: labels.thirdPlaceLabel }]
      : []),
  ];
  const height = pad * 2 + 56 + rows.length * (lineHeight + 12) + 24;

  const bodyRows = rows
    .map((row, i) => {
      const y = pad + 56 + i * (lineHeight + 12);
      return `
    <text x="${pad}" y="${y}" font-size="22" fill="#e2e8f0">${row.emoji} ${escapeXml(row.title)}</text>
    <text x="${pad}" y="${y + 28}" font-size="26" font-weight="600" fill="#ffffff">${escapeXml(truncate(row.value, 48))}</text>`;
    })
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${pad}" y="${pad + 28}" font-size="28" font-weight="700" fill="#38bdf8">${escapeXml(truncate(labels.leagueName, 40))}</text>
  <text x="${pad}" y="${pad + 52}" font-size="18" fill="#94a3b8">Bracket results</text>
  ${bodyRows}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
