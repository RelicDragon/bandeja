import puppeteer from 'puppeteer';
import { AdminAdStatsService, AdStatsFilters } from './adStats.service';

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export class AdminAdExportService {
  static async campaignCsv(campaignId: string, filters: AdStatsFilters): Promise<string> {
    const stats = await AdminAdStatsService.campaignStats(campaignId, filters);
    const lines = [
      'date,placement,cityId,locale,impressions,uniqueUsers,clicks,dismisses',
    ];

    for (const row of stats.rollups) {
      lines.push(
        [
          row.date.toISOString().slice(0, 10),
          row.placement,
          row.cityId,
          row.locale,
          row.impressions,
          row.uniqueUsers,
          row.clicks,
          row.dismisses,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    if (stats.rawBreakdown.length > 0) {
      lines.push('');
      lines.push('# raw breakdown (recent)');
      lines.push('placement,cityId,locale,impressions,uniqueUsers,clicks,dismisses');
      for (const row of stats.rawBreakdown) {
        lines.push(
          [
            row.placement,
            row.cityId,
            row.locale,
            row.impressions,
            row.uniqueUsers,
            row.clicks,
            row.dismisses,
          ]
            .map(escapeCsv)
            .join(',')
        );
      }
    }

    return lines.join('\n');
  }

  static async sponsorCsv(sponsorId: string, filters: AdStatsFilters): Promise<string> {
    const stats = await AdminAdStatsService.sponsorStats(sponsorId, filters);
    const lines = [
      'date,campaignId,campaignName,placement,cityId,locale,impressions,uniqueUsers,clicks,dismisses',
    ];

    for (const row of stats.rollups) {
      lines.push(
        [
          row.date.toISOString().slice(0, 10),
          row.campaignId,
          row.campaign.name,
          row.placement,
          row.cityId,
          row.locale,
          row.impressions,
          row.uniqueUsers,
          row.clicks,
          row.dismisses,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    return lines.join('\n');
  }

  static async sponsorPdf(sponsorId: string, filters: AdStatsFilters): Promise<Buffer> {
    const stats = await AdminAdStatsService.sponsorStats(sponsorId, filters);

    const campaignRows = stats.byCampaign
      .map(
        (c) =>
          `<tr><td>${c.name}</td><td>${c.impressions}</td><td>${c.clicks}</td><td>${c.dismisses}</td><td>${c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0'}%</td></tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111}
h1{font-size:24px;margin:0 0 8px}
.summary{display:flex;gap:24px;margin:24px 0}
.card{background:#f5f5f5;padding:16px;border-radius:8px;min-width:120px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
th{background:#fafafa}
</style></head><body>
<h1>${stats.sponsor.name} — Sponsor Report</h1>
<p>Generated ${new Date().toISOString().slice(0, 10)}</p>
<div class="summary">
  <div class="card"><strong>Impressions</strong><div>${stats.totals.impressions}</div></div>
  <div class="card"><strong>Clicks</strong><div>${stats.totals.clicks}</div></div>
  <div class="card"><strong>CTR</strong><div>${(stats.ctr * 100).toFixed(2)}%</div></div>
  <div class="card"><strong>Dismisses</strong><div>${stats.totals.dismisses}</div></div>
</div>
<h2>By campaign</h2>
<table><thead><tr><th>Campaign</th><th>Impressions</th><th>Clicks</th><th>Dismisses</th><th>CTR</th></tr></thead>
<tbody>${campaignRows}</tbody></table>
</body></html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
