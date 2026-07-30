const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'Frontend');
const BACKEND = path.join(ROOT, 'Backend');
const { chromium } = require(path.join(FRONTEND, 'node_modules/playwright'));
const sharp = require(path.join(BACKEND, 'node_modules/sharp'));

const WIDTH = 1535;
const HEIGHT = 1063;
const OUTPUT_PATH = path.join(
  FRONTEND,
  'public/fix-liga-leto-2026-congratulations.png'
);
const LOGO_PATH = path.join(FRONTEND, 'public/bandeja2-white-tr.png');

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

async function buildLogoDataUri() {
  const png = await sharp(LOGO_PATH).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function buildHtml(logoDataUri) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: #ABDDE3;
    font-family: Manrope, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .card {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    padding: 60px 78px 54px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    overflow: hidden;
    background:
      radial-gradient(
        120% 90% at 50% 42%,
        rgba(255, 255, 255, 0.42) 0%,
        rgba(255, 255, 255, 0) 62%
      ),
      #ABDDE3;
  }
  .roster { width: 100%; }
  .line {
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    height: 44px;
  }
  .line--full { justify-content: space-between; }
  .line--short { justify-content: center; gap: 20px; }
  .line span {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: 0.3px;
    color: rgba(11, 52, 60, 0.33);
  }
  .line span.dot { color: rgba(11, 52, 60, 0.24); }
  .message {
    text-align: center;
    color: #0B3138;
  }
  .message p {
    font-size: 40px;
    font-weight: 800;
    line-height: 50px;
  }
  .footer {
    width: 100%;
    min-height: 128px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .event {
    justify-self: center;
    text-align: center;
  }
  .liga {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 7px;
    color: #0B3138;
  }
  .season {
    margin-top: 12px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 4px;
    color: rgba(11, 52, 60, 0.74);
  }
  .brand {
    justify-self: end;
    text-align: center;
    font-family: 'Playfair Display', 'Times New Roman', serif;
    color: #2C2724;
  }
  .brand-main {
    font-size: 44px;
    font-weight: 500;
    letter-spacing: 7px;
    text-indent: 7px;
  }
  .brand-sub {
    margin-top: 3px;
    font-family: Manrope, 'Helvetica Neue', Arial, sans-serif;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 11px;
    text-indent: 11px;
  }
  .mark {
    justify-self: start;
    width: 128px;
    height: 128px;
    object-fit: contain;
    transform: rotate(30deg);
  }
  .measure {
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font-size: 28px;
    font-weight: 500;
    letter-spacing: 0.3px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="message">
      <p>ТЫ — ЧАСТЬ БОЛЬШОГО ДВИЖЕНИЯ,</p>
      <p>ОСТАВИВШАЯ СВОЙ СЛЕД В НАШЕЙ</p>
      <p>ОБЩЕЙ ИСТОРИИ!</p>
    </div>
    <div class="roster" id="roster"></div>
    <div class="footer">
      <img class="mark" src="${logoDataUri}" alt="">
      <div class="event">
        <div class="liga">FIX PADEL LIGA</div>
        <div class="season">LETO 2026, NOVI SAD</div>
      </div>
      <div class="brand">
        <div class="brand-main">BANDEJA</div>
        <div class="brand-sub">SPORTS</div>
      </div>
    </div>
  </div>
<script>
  const NAMES = ${JSON.stringify(NAMES)};
  const MIN_GAP = 18;

  const probe = document.createElement('span');
  probe.className = 'measure';
  document.body.appendChild(probe);
  const measure = (text) => {
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  };

  const lineWidth = document.getElementById('roster').getBoundingClientRect().width;
  const dotWidth = measure('·');
  const widths = NAMES.map(measure);

  const measureLine = (indices) => {
    let content = 0;
    indices.forEach((nameIndex, index) => {
      content += widths[nameIndex] + (index ? dotWidth : 0);
    });
    return content;
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
    if (!picked.length) break;
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

  const roster = document.getElementById('roster');
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
      name.textContent = NAMES[currentNameIndex];
      element.appendChild(name);
    });
    roster.appendChild(element);
  });
  window.__lineCount = lines.length;
</script>
</body>
</html>`;
}

async function render() {
  const logoDataUri = await buildLogoDataUri();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
  });

  await page.setContent(buildHtml(logoDataUri), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fontsLoaded = await page.evaluate(() =>
    document.fonts.check('700 28px Manrope')
  );
  const lineCount = await page.evaluate(() => window.__lineCount);
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();

  await sharp(screenshot)
    .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  const metadata = await sharp(OUTPUT_PATH).metadata();
  console.log(
    `fonts=${fontsLoaded} roster-lines=${lineCount} ` +
      `${metadata.width}x${metadata.height} -> ${OUTPUT_PATH}`
  );
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
