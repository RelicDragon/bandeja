/**
 * Unmocked html2canvas regression: Tailwind 4 oklch on the page must not break
 * capture of the results share card (hex/rgba inline styles only).
 *
 * Run: node scripts/verify-game-results-share-export.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADycZi2rQAAAAAElFTkSuQmCC';

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { --color-slate-900: oklch(0.208 0.042 265.755); --color-violet-950: oklch(0.283 0.141 291.089); }
    .poison { background: linear-gradient(to bottom right in oklab, var(--color-slate-900), var(--color-violet-950)); color: oklch(0.7 0.15 290); }
  </style>
</head>
<body>
  <div class="poison" style="padding:8px">ambient oklch</div>
  <div id="card" data-testid="game-results-share-card" style="width:24rem;overflow:hidden;border-radius:1rem;border:1px solid rgba(167,139,250,0.3);background:linear-gradient(to bottom right,#0f172a,#2e1065,#0f172a);padding:1rem;color:#ffffff">
    <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#c4b5fd">Match results</p>
    <h3 style="margin:0.25rem 0 0;font-size:1.125rem;font-weight:700">Friday match</h3>
    <img src="${TINY_PNG}" alt="" style="margin-top:0.75rem;aspect-ratio:4/3;width:100%;border-radius:0.75rem;object-fit:cover" />
    <p style="margin:0.75rem 0 0;font-size:0.875rem;color:#e2e8f0">Great session!</p>
  </div>
  <div id="broken" class="poison" style="width:24rem;padding:1rem;margin-top:1rem">oklch card (must fail)</div>
  <pre id="out"></pre>
  <script type="module">
    import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';
    const out = document.getElementById('out');
    const log = (s) => { out.textContent += s + '\\n'; };
    try {
      const ok = await html2canvas(document.getElementById('card'), {
        backgroundColor: '#0f172a', scale: 1, useCORS: true, logging: false,
      });
      const blob = await new Promise((r) => ok.toBlob(r, 'image/png'));
      log('CARD_OK ' + (blob?.size || 0));
    } catch (e) {
      log('CARD_FAIL ' + e.message);
    }
    try {
      await html2canvas(document.getElementById('broken'), {
        backgroundColor: '#0f172a', scale: 1, useCORS: true, logging: false,
      });
      log('BROKEN_OK');
    } catch (e) {
      log('BROKEN_FAIL ' + e.message);
    }
    window.__DONE__ = true;
  </script>
</body>
</html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/' || req.url?.startsWith('/?')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

const { server, port } = await startServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.__DONE__ === true, undefined, { timeout: 30000 });
  const text = await page.locator('#out').innerText();
  if (!text.includes('CARD_OK')) {
    throw new Error(`expected CARD_OK, got:\\n${text}`);
  }
  if (!text.includes('BROKEN_FAIL') || !text.toLowerCase().includes('oklch')) {
    throw new Error(`expected BROKEN_FAIL oklch, got:\\n${text}`);
  }
  // Ensure component source stays capture-safe (no Tailwind color utilities on visual).
  const visual = readFileSync(
    join(root, 'src/components/GameDetails/GameResultsShareCardVisual.tsx'),
    'utf8'
  );
  for (const banned of ['from-slate-', 'via-violet-', 'to-slate-', 'text-violet-', 'text-slate-', 'bg-gradient-', 'border-violet-', 'bg-violet-']) {
    if (visual.includes(banned)) {
      throw new Error(`GameResultsShareCardVisual contains banned Tailwind token: ${banned}`);
    }
  }
  console.log('verify-game-results-share-export: ok');
  console.log(text.trim());
} finally {
  await browser.close();
  server.close();
}
