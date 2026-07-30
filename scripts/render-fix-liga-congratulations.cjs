const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'Frontend');
const BACKEND = path.join(ROOT, 'Backend');
const { chromium } = require(path.join(FRONTEND, 'node_modules/playwright'));
const sharp = require(path.join(BACKEND, 'node_modules/sharp'));

const WIDTH = 1535;
const HEIGHT = 1063;
const DENSITY = 300;
const OUTPUT_PATH = path.join(
  FRONTEND,
  'public/fix-liga-leto-2026-congratulations.png'
);
const LOGO_PATH = path.join(FRONTEND, 'public/bandeja2-white-tr.png');
const FONT_DIR = path.join(__dirname, 'assets/fix-liga-fonts');
const FONT_PATHS = {
  manrope600: path.join(FONT_DIR, 'manrope-600.ttf'),
  manrope800: path.join(FONT_DIR, 'manrope-800.ttf'),
  playfair600: path.join(FONT_DIR, 'playfair-display-600.ttf'),
};

const NAMES = [
  'Aleksandr S2pac',
  'Aleksei C C',
  'Aleksei Zelenskii',
  'Alexander Plyaskin',
  'Alexander Subbotin',
  "Alexandr Savel'ev",
  'Andre Sukhov',
  'Andrey Efremenkov',
  'Andrey Kirilenko',
  'Anton Sigarev',
  'Artem Fedorov',
  'Artem Paskevich',
  'Artyom Kvasov',
  'Artyom Tereshenkov',
  'Daria Nikolaeva',
  'Daria Viurkova',
  'Denis Kotenko',
  'Dmitrii Lem',
  'Ed Krasilnikov',
  'Ekaterina Bugakova',
  'Elizaveta Ignatchenko',
  'Evgeniy Morozov',
  'George Doronin',
  'Herman Shvetsov',
  'Iaroslav Karamyshev',
  'Igor Inkovski',
  'Igor Tikhomirov',
  'Ivan',
  'ivan kozlov',
  'Ivan Manko',
  'Kate Bystrykh',
  'Konstantin',
  'Lesha_Lesha',
  'Lizi_biz',
  'Maria Kovatsenko',
  'Mark Nusvald',
  'Mihail Mikriukov',
  'Nikita Akimov',
  'Nikita Korol',
  'Nikita Murenkii',
  'Nikola Malimarkov',
  'OLESYA Is',
  'Pavel Boyko',
  'Pavel Ostroukhov',
  'Relic Dragon',
  'Sasha Mijanovic',
  'Sergei Polinko',
  'Sergey Satyukov',
  'Sergey Vadimovich',
  'Slava Bur',
  'Stanislav Kucherov',
  'Vadim',
  'Vadim Lobanov',
  'Valeriia Liubimova',
  'Valeriy Timchenko',
  'Vasilisa',
  'Viktor Rutonic',
  'Vladimir Belov',
  'Yulia Kuldo',
  'Yurasun X',
  'Zemfira Vildanova',
  'Аиша П',
  'Александр Клюшников',
  'Валентин Тимченко',
  'Даня',
  'Денис Рютин',
  'Дмитрий Волков',
  'Евгений Пожидаев',
  'Максим Бородин',
  'Надежда Вашурова',
  'Никита Лукин',
  'Роман 4',
  'Станислав',
];

function resolveHighlightedName() {
  const flagIndex = process.argv.indexOf('--highlight');
  const inlineFlag = process.argv.find((argument) =>
    argument.startsWith('--highlight=')
  );
  const requested =
    (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ||
    inlineFlag?.slice('--highlight='.length) ||
    process.env.HIGHLIGHT_NAME;

  if (requested && !NAMES.includes(requested)) {
    throw new Error(`Unknown participant requested for highlight: ${requested}`);
  }

  return requested || NAMES[Math.floor(Math.random() * NAMES.length)];
}

async function buildLogoDataUri() {
  const png = await sharp(LOGO_PATH).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function buildFontDataUris() {
  const entries = await Promise.all(
    Object.entries(FONT_PATHS).map(async ([name, fontPath]) => {
      const font = await fs.readFile(fontPath);
      return [name, `data:font/ttf;base64,${font.toString('base64')}`];
    })
  );
  return Object.fromEntries(entries);
}

function buildHtml(logoDataUri, fontDataUris, highlightedName) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: Manrope;
    src: url("${fontDataUris.manrope600}") format("truetype");
    font-style: normal;
    font-weight: 600;
    font-display: block;
  }
  @font-face {
    font-family: Manrope;
    src: url("${fontDataUris.manrope800}") format("truetype");
    font-style: normal;
    font-weight: 800;
    font-display: block;
  }
  @font-face {
    font-family: 'Playfair Display';
    src: url("${fontDataUris.playfair600}") format("truetype");
    font-style: normal;
    font-weight: 600;
    font-display: block;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: #abdee3;
    font-family: Manrope, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .card {
    --brand: #abdee3;
    --ink: #0b343b;
    --paper: #e8f7f5;
    position: relative;
    isolation: isolate;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    padding: 42px 58px 34px;
    display: grid;
    grid-template-rows: 216px minmax(0, 1fr) 60px;
    gap: 16px;
    overflow: hidden;
    background:
      radial-gradient(
        60% 100% at 52% -32%,
        rgba(255, 255, 255, 0.48) 0%,
        rgba(255, 255, 255, 0) 72%
      ),
      radial-gradient(
        44% 64% at 100% 100%,
        rgba(54, 137, 147, 0.16) 0%,
        rgba(54, 137, 147, 0) 76%
      ),
      var(--brand);
    color: var(--ink);
  }
  .card::before {
    content: '';
    position: absolute;
    z-index: -3;
    inset: 0;
    background-image:
      linear-gradient(rgba(11, 52, 59, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(11, 52, 59, 0.035) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .card::after {
    content: '73';
    position: absolute;
    z-index: -2;
    right: 268px;
    top: -66px;
    font-size: 300px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -22px;
    color: rgba(255, 255, 255, 0.2);
  }
  .court {
    position: absolute;
    z-index: -1;
    top: -490px;
    right: -74px;
    width: 570px;
    height: 900px;
    border: 2px solid rgba(11, 52, 59, 0.09);
    border-radius: 10px;
    transform: rotate(17deg);
  }
  .court::before,
  .court::after {
    content: '';
    position: absolute;
    background: rgba(11, 52, 59, 0.09);
  }
  .court::before {
    left: 50%;
    top: 0;
    width: 2px;
    height: 100%;
  }
  .court::after {
    left: 0;
    top: 50%;
    width: 100%;
    height: 2px;
  }
  .hero {
    position: relative;
    display: grid;
    grid-template-rows: 31px minmax(0, 1fr);
  }
  .topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .edition {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 2.1px;
    text-transform: uppercase;
    color: var(--ink);
  }
  .edition::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink);
  }
  .location {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(11, 52, 59, 0.68);
  }
  .hero__content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 326px;
    align-items: center;
  }
  .headline {
    max-width: 1000px;
    font-size: 42px;
    font-weight: 800;
    line-height: 1.14;
    letter-spacing: -1.6px;
    text-transform: uppercase;
  }
  .headline span {
    display: block;
  }
  .hero__art {
    position: relative;
    align-self: stretch;
  }
  .hero__art::before {
    content: '';
    position: absolute;
    width: 196px;
    height: 196px;
    right: 20px;
    bottom: -2px;
    border-radius: 50%;
    background: transparent;
  }
  .hero__art::after {
    content: '';
    position: absolute;
    right: 11px;
    bottom: 8px;
    width: 206px;
    height: 206px;
    border: 2px solid rgba(11, 52, 59, 0.22);
    border-radius: 50%;
    transform: translate(18px, -16px);
  }
  .mark {
    position: absolute;
    z-index: 1;
    right: -4px;
    bottom: 9px;
    width: 276px;
    height: 173px;
    object-fit: contain;
  }
  .roster {
    position: relative;
    min-height: 0;
    padding: 18px 24px 20px;
    border: 2px solid rgba(11, 52, 59, 0.16);
    border-radius: 18px;
    background:
      linear-gradient(125deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.34));
    overflow: hidden;
  }
  .roster::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      rgba(11, 52, 59, 0.025),
      transparent 28%,
      transparent 72%,
      rgba(11, 52, 59, 0.025)
    );
  }
  .roster__head {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 13px;
    border-bottom: 2px solid rgba(11, 52, 59, 0.12);
  }
  .roster__label {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 2.2px;
    text-transform: uppercase;
    color: var(--ink);
  }
  .roster__meta {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(11, 52, 59, 0.64);
  }
  .participants {
    position: relative;
    height: calc(100% - 34px);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .line {
    display: flex;
    flex: 0 0 43px;
    align-items: baseline;
    width: 100%;
    height: 43px;
    white-space: nowrap;
  }
  .line--full {
    justify-content: space-between;
  }
  .line--short {
    justify-content: center;
    gap: 18px;
  }
  .line span {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: 28px;
    font-weight: 600;
    line-height: 38px;
    letter-spacing: -0.25px;
    color: rgba(11, 52, 59, 0.34);
  }
  .line span.dot {
    color: rgba(11, 52, 59, 0.16);
  }
  .line span.participant-name--highlight,
  .measure.participant-name--highlight {
    border-radius: 5px;
    background: var(--ink);
    box-shadow:
      0 0 0 4px var(--ink),
      0 0 0 7px rgba(11, 52, 59, 0.12);
    color: var(--paper);
  }
  .measure {
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.25px;
  }
  .footer {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .event {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .event__mascot {
    display: grid;
    place-items: center;
    width: 66px;
    height: 50px;
  }
  .event__mascot img {
    width: 78px;
    height: 49px;
    object-fit: contain;
  }
  .event__name {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 2.3px;
  }
  .event__season {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.3px;
    color: rgba(11, 52, 59, 0.62);
  }
  .footer__message {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: rgba(11, 52, 59, 0.58);
  }
  .footer__message::before,
  .footer__message::after {
    content: '';
    width: 34px;
    height: 2px;
    background: rgba(11, 52, 59, 0.18);
  }
  .brand {
    justify-self: end;
    text-align: center;
    font-family: 'Playfair Display', 'Times New Roman', serif;
    color: var(--ink);
  }
  .brand-main {
    font-size: 27px;
    font-weight: 600;
    letter-spacing: 5.5px;
    text-indent: 5.5px;
  }
  .brand-sub {
    margin-top: 1px;
    font-family: Manrope, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 7px;
    text-indent: 7px;
    color: rgba(11, 52, 59, 0.66);
  }
</style>
</head>
<body>
  <div class="card">
    <div class="court"></div>
    <header class="hero">
      <div class="topline">
        <div class="edition">Поздравляем участников</div>
        <div class="location">Novi Sad · Leto 2026</div>
      </div>
      <div class="hero__content">
        <div>
          <h1 class="headline">
            <span>Ты — часть большого движения,</span>
            <span>оставившая свой след в нашей</span>
            <span>общей истории!</span>
          </h1>
        </div>
        <div class="hero__art">
          <img class="mark" src="${logoDataUri}" alt="">
        </div>
      </div>
    </header>
    <main class="roster">
      <div class="roster__head">
        <div class="roster__label">Все участники лиги</div>
        <div class="roster__meta">${NAMES.length} игрока · FIX PADEL LIGA</div>
      </div>
      <div class="participants" id="participants"></div>
    </main>
    <div class="footer">
      <div class="event">
        <div class="event__mascot">
          <img src="${logoDataUri}" alt="">
        </div>
        <div>
          <div class="event__name">FIX PADEL LIGA</div>
          <div class="event__season">LETO 2026 · NOVI SAD</div>
        </div>
      </div>
      <div class="footer__message">Спасибо, что вы с нами</div>
      <div class="brand">
        <div class="brand-main">BANDEJA</div>
        <div class="brand-sub">SPORTS</div>
      </div>
    </div>
  </div>
<script>
  const NAMES = ${JSON.stringify(NAMES)};
  const HIGHLIGHTED_NAME = ${JSON.stringify(highlightedName)};
  const MIN_GAP = 14;

  window.__buildRoster = () => {
    const roster = document.getElementById('participants');
    const probe = document.createElement('span');
    probe.className = 'measure';
    document.body.appendChild(probe);

    const measure = (text) => {
      probe.className = 'measure';
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    const lineWidth = roster.getBoundingClientRect().width;
    const dotWidth = measure('·');
    const widths = NAMES.map(measure);
    const measureLine = (indices) => {
      let contentWidth = 0;
      indices.forEach((nameIndex, index) => {
        contentWidth += widths[nameIndex] + (index ? dotWidth : 0);
      });
      return contentWidth;
    };
    const fits = (indices) =>
      measureLine(indices) +
        Math.max(0, indices.length - 1) * 2 * MIN_GAP <=
      lineWidth;

    const lines = [];
    let nameIndex = 0;
    while (nameIndex < NAMES.length) {
      const picked = [];
      while (nameIndex + picked.length < NAMES.length) {
        const candidate = picked.concat(nameIndex + picked.length);
        if (picked.length && !fits(candidate)) break;
        picked.push(nameIndex + picked.length);
      }
      nameIndex += picked.length;
      lines.push({ indices: picked });
    }

    for (let pass = 0; pass < 12; pass += 1) {
      const last = lines[lines.length - 1];
      if (!last || lines.length < 2 || last.indices.length >= 3) break;
      const previous = lines[lines.length - 2];
      if (previous.indices.length <= 2) break;
      const moved = previous.indices.pop();
      last.indices.unshift(moved);
      if (!fits(last.indices)) {
        last.indices.shift();
        previous.indices.push(moved);
        break;
      }
    }

    lines.forEach((line) => {
      line.content = measureLine(line.indices);
    });
    lines.forEach((line, lineIndex) => {
      const element = document.createElement('div');
      const slack = lineWidth - line.content;
      const gapCount = Math.max(1, (line.indices.length - 1) * 2);
      const isFinalLine = lineIndex === lines.length - 1;
      element.className =
        isFinalLine && slack / gapCount > MIN_GAP * 2.4
          ? 'line line--short'
          : 'line line--full';

      line.indices.forEach((currentNameIndex, index) => {
        if (index) {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.textContent = '·';
          element.appendChild(dot);
        }
        const name = document.createElement('span');
        name.className =
          NAMES[currentNameIndex] === HIGHLIGHTED_NAME
            ? 'participant-name participant-name--highlight'
            : 'participant-name';
        name.textContent = NAMES[currentNameIndex];
        element.appendChild(name);
      });
      roster.appendChild(element);
    });
    probe.remove();

    const card = document.querySelector('.card');
    const names = Array.from(document.querySelectorAll('.participant-name'));
    const renderedLines = Array.from(document.querySelectorAll('.line'));
    const cardRect = card.getBoundingClientRect();
    const content = Array.from(card.querySelectorAll('.hero, .roster, .footer'));
    window.__renderStats = {
      participantCount: names.length,
      highlightedCount: names.filter((name) =>
        name.classList.contains('participant-name--highlight')
      ).length,
      highlightedName: HIGHLIGHTED_NAME,
      lineCount: renderedLines.length,
      nameFontPx: Number.parseFloat(getComputedStyle(names[0]).fontSize),
      contentOverflow: content.some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < cardRect.left ||
          rect.top < cardRect.top ||
          rect.right > cardRect.right ||
          rect.bottom > cardRect.bottom
        );
      }),
      clippedNames: renderedLines.filter(
        (line) => line.scrollWidth > line.clientWidth
      ).length,
    };
  };
</script>
</body>
</html>`;
}

async function createRenderSession() {
  const [logoDataUri, fontDataUris] = await Promise.all([
    buildLogoDataUri(),
    buildFontDataUris(),
  ]);
  const browser = await chromium.launch();
  let closed = false;

  return {
    async renderCard({ highlightedName, outputPath }) {
      if (closed) throw new Error('Render session is already closed');
      if (!NAMES.includes(highlightedName)) {
        throw new Error(`Unknown participant requested: ${highlightedName}`);
      }

      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 2,
      });
      try {
        await page.setContent(
          buildHtml(logoDataUri, fontDataUris, highlightedName),
          {
          waitUntil: 'load',
          }
        );
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          await Promise.all([
            document.fonts.load(
              '800 42px Manrope',
              'Ты — часть большого движения'
            ),
            document.fonts.load('600 28px Manrope', 'Aleksandr S2pac'),
            document.fonts.load('600 28px Manrope', 'Александр Клюшников'),
          ]);
          await document.fonts.ready;
        });
        const fontsLoaded = await page.evaluate(
          () =>
            document.fonts.check(
              '800 42px Manrope',
              'Ты — часть большого движения'
            ) &&
            document.fonts.check('600 28px Manrope', 'Aleksandr S2pac') &&
            document.fonts.check('600 28px Manrope', 'Александр Клюшников')
        );
        if (!fontsLoaded) {
          throw new Error('Required Manrope font subsets did not load');
        }
        await page.evaluate(() => window.__buildRoster());
        const stats = await page.evaluate(() => window.__renderStats);
        const screenshot = await page.screenshot({ type: 'png' });

        if (stats.participantCount !== NAMES.length) {
          throw new Error(
            `Expected ${NAMES.length} participants, ` +
              `rendered ${stats.participantCount}`
          );
        }
        if (stats.highlightedCount !== 1) {
          throw new Error(
            `Expected one highlighted participant, ` +
              `rendered ${stats.highlightedCount}`
          );
        }
        if (stats.highlightedName !== highlightedName) {
          throw new Error(
            `Expected highlight ${JSON.stringify(highlightedName)}, ` +
              `rendered ${JSON.stringify(stats.highlightedName)}`
          );
        }
        if (stats.contentOverflow || stats.clippedNames) {
          throw new Error(
            `Layout overflow: content=${stats.contentOverflow} ` +
              `clipped-names=${stats.clippedNames}`
          );
        }
        if (stats.nameFontPx < 28) {
          throw new Error(
            `Participant names are too small: ${stats.nameFontPx}px`
          );
        }

        await sharp(screenshot)
          .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
          .withMetadata({ density: DENSITY })
          .png({ compressionLevel: 9 })
          .toFile(outputPath);

        const metadata = await sharp(outputPath).metadata();
        return {
          fontsLoaded,
          highlightedName: stats.highlightedName,
          metadata,
          namePointSize: (stats.nameFontPx * 72) / DENSITY,
          outputPath,
          stats,
        };
      } finally {
        await page.close();
      }
    },

    async close() {
      if (closed) return;
      closed = true;
      await browser.close();
    },
  };
}

function logRenderResult(result) {
  const { fontsLoaded, highlightedName, metadata, namePointSize, outputPath, stats } =
    result;
  console.log(
    `fonts=${fontsLoaded} participants=${stats.participantCount} ` +
      `highlighted=${JSON.stringify(highlightedName)} ` +
      `roster-lines=${stats.lineCount} ` +
      `clipped-names=${stats.clippedNames} ` +
      `name-type=${namePointSize.toFixed(1)}pt ` +
      `${metadata.width}x${metadata.height}@${metadata.density}dpi -> ${outputPath}`
  );
}

async function renderSingleCard() {
  const session = await createRenderSession();
  try {
    const result = await session.renderCard({
      highlightedName: resolveHighlightedName(),
      outputPath: OUTPUT_PATH,
    });
    logRenderResult(result);
  } finally {
    await session.close();
  }
}

module.exports = {
  DENSITY,
  HEIGHT,
  NAMES,
  OUTPUT_PATH,
  WIDTH,
  createRenderSession,
  logRenderResult,
};

if (require.main === module) {
  renderSingleCard().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
