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
const DEFAULT_WISHES_URL =
  'http://localhost:3000/api/public/landings/liza_birthday_2026/wishes';
const OUTPUT_DIR = path.join(
  FRONTEND,
  'public/LizaBirthday2026Wishes/cards'
);
const LOGO_PATH = path.join(FRONTEND, 'public/bandeja2-white-tr.png');
const PADEL_ICON_PATH = path.join(FRONTEND, 'public/sports/padel.png');
const FONT_DIR = path.join(__dirname, 'assets/fix-liga-fonts');
const FONT_PATHS = {
  manrope600: path.join(FONT_DIR, 'manrope-600.ttf'),
  manrope800: path.join(FONT_DIR, 'manrope-800.ttf'),
  playfair600: path.join(FONT_DIR, 'playfair-display-600.ttf'),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cardFilename(index) {
  return `card_${String(index + 1).padStart(2, '0')}.png`;
}

function resolveIndex(total) {
  const flagIndex = process.argv.indexOf('--index');
  const inlineFlag = process.argv.find((argument) =>
    argument.startsWith('--index=')
  );
  const raw =
    (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ||
    inlineFlag?.slice('--index='.length) ||
    '1';
  const requested = Number.parseInt(raw, 10);
  if (!Number.isInteger(requested) || requested < 1 || requested > total) {
    throw new Error(`Wish index must be between 1 and ${total}: ${raw}`);
  }
  return requested - 1;
}

async function fetchWishes(url = process.env.WISHES_URL || DEFAULT_WISHES_URL) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Wish request failed with status ${response.status}: ${url}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.wishes)) {
    throw new Error(`Unexpected wish response: ${url}`);
  }

  const wishes = payload.wishes.filter(
    (wish) =>
      wish &&
      typeof wish.id === 'string' &&
      typeof wish.displayName === 'string' &&
      typeof wish.message === 'string'
  );
  if (wishes.length !== payload.wishes.length || wishes.length === 0) {
    throw new Error('Wish response contained invalid or empty entries');
  }
  return wishes;
}

async function buildLogoDataUri() {
  const png = await sharp(LOGO_PATH)
    .resize({ width: 360, withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function buildPadelIconDataUri() {
  const png = await sharp(PADEL_ICON_PATH)
    .resize({ width: 120, withoutEnlargement: true })
    .png()
    .toBuffer();
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

function buildFallbackAvatar(displayName) {
  const initial = Array.from(displayName.trim())[0]?.toUpperCase() || 'B';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ed7892"/>
          <stop offset="1" stop-color="#d8a867"/>
        </linearGradient>
      </defs>
      <rect width="520" height="520" fill="url(#g)"/>
      <text x="260" y="334" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="250" font-weight="700" fill="#1b0c18">${escapeHtml(initial)}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function buildAvatarDataUri(wish) {
  if (!wish.avatarUrl) return buildFallbackAvatar(wish.displayName);

  try {
    const response = await fetch(wish.avatarUrl);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const source = Buffer.from(await response.arrayBuffer());
    const avatar = await sharp(source)
      .rotate()
      .resize(640, 640, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
      .toBuffer();
    return `data:image/jpeg;base64,${avatar.toString('base64')}`;
  } catch (error) {
    console.warn(
      `Avatar unavailable for ${wish.displayName}; using initials (${error.message})`
    );
    return buildFallbackAvatar(wish.displayName);
  }
}

function buildHtml({
  avatarDataUri,
  fontDataUris,
  index,
  logoDataUri,
  padelIconDataUri,
  total,
  wish,
}) {
  const cardNumber = String(index + 1).padStart(2, '0');
  const cardTotal = String(total).padStart(2, '0');
  const displayName = escapeHtml(wish.displayName.trim());
  const message = escapeHtml(wish.message.trim());

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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    overflow: hidden;
    background: #1a0b16;
    font-family: Manrope, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .card {
    --night: #1a0b16;
    --wine: #321321;
    --cream: #fff7ed;
    --cream-muted: #f4e7dc;
    --pink: #ee7f98;
    --gold: #e1b66f;
    --lime: #d9ec68;
    position: relative;
    isolation: isolate;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    padding: 38px 58px 32px;
    display: grid;
    grid-template-rows: 74px minmax(0, 1fr) 72px;
    gap: 20px;
    overflow: hidden;
    color: var(--cream);
    background:
      radial-gradient(780px 540px at 88% 8%, rgba(238, 127, 152, 0.19), transparent 69%),
      radial-gradient(620px 580px at -3% 105%, rgba(225, 182, 111, 0.13), transparent 70%),
      linear-gradient(143deg, #160a13 0%, #24101c 51%, #180a14 100%);
  }
  .card::before {
    content: '';
    position: absolute;
    z-index: -3;
    inset: 0;
    opacity: 0.19;
    background-image:
      linear-gradient(rgba(255, 247, 237, 0.11) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 247, 237, 0.11) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: linear-gradient(90deg, black, transparent 62%);
  }
  .court {
    position: absolute;
    z-index: -2;
    right: -252px;
    bottom: -378px;
    width: 1005px;
    height: 1260px;
    border: 3px solid rgba(255, 247, 237, 0.1);
    border-radius: 16px;
    transform: rotate(-10deg) skewY(3deg);
  }
  .court::before,
  .court::after {
    content: '';
    position: absolute;
    background: rgba(255, 247, 237, 0.1);
  }
  .court::before { left: 50%; top: 0; width: 3px; height: 100%; }
  .court::after { left: 0; top: 50%; width: 100%; height: 3px; }
  .service-line {
    position: absolute;
    z-index: -2;
    right: 48px;
    bottom: 228px;
    width: 692px;
    height: 3px;
    background: rgba(255, 247, 237, 0.09);
    transform: rotate(-10deg);
  }
  .halo {
    position: absolute;
    z-index: -1;
    right: 58px;
    top: 56px;
    width: 330px;
    height: 330px;
    border: 2px solid rgba(238, 127, 152, 0.19);
    border-radius: 50%;
  }
  .halo::before,
  .halo::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    border: 2px solid rgba(225, 182, 111, 0.12);
  }
  .halo::before { inset: 31px; }
  .halo::after { inset: 76px; }
  .header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .identity {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .identity img {
    width: 86px;
    height: 54px;
    object-fit: contain;
  }
  .identity__brand {
    font-family: 'Playfair Display', 'Times New Roman', serif;
    font-size: 25px;
    line-height: 1;
    letter-spacing: 4px;
  }
  .identity__sub {
    margin-top: 5px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 5px;
    color: rgba(255, 247, 237, 0.58);
  }
  .series {
    justify-self: center;
    font-size: 27px;
    font-weight: 800;
    letter-spacing: 2.4px;
    text-transform: uppercase;
    color: var(--cream);
  }
  .date {
    justify-self: end;
    text-align: right;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.65;
    letter-spacing: 2.4px;
    text-transform: uppercase;
  }
  .date span { display: block; color: var(--gold); }
  .wish-shell {
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-columns: 390px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid rgba(255, 247, 237, 0.18);
    border-radius: 30px;
    background: var(--cream);
    box-shadow:
      0 34px 90px rgba(4, 0, 3, 0.36),
      0 0 0 8px rgba(255, 247, 237, 0.025);
  }
  .author {
    position: relative;
    overflow: hidden;
    padding: 36px 34px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--cream);
    background:
      radial-gradient(290px 240px at 50% 35%, rgba(238, 127, 152, 0.19), transparent 72%),
      linear-gradient(165deg, #381522 0%, #250f1b 67%, #1b0c17 100%);
  }
  .author::before {
    content: '${cardNumber}';
    position: absolute;
    right: -20px;
    bottom: -42px;
    font-size: 198px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -13px;
    color: rgba(255, 247, 237, 0.035);
  }
  .wish-number {
    position: relative;
    z-index: 1;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.9px;
    text-transform: uppercase;
    color: rgba(255, 247, 237, 0.65);
  }
  .wish-number strong {
    color: var(--gold);
    font-size: 15px;
    letter-spacing: 1.5px;
  }
  .portrait-wrap {
    position: relative;
    width: 246px;
    height: 246px;
    margin-top: 31px;
    flex: 0 0 auto;
  }
  .portrait-ring {
    position: absolute;
    inset: -13px 15px 13px -15px;
    border: 2px solid rgba(225, 182, 111, 0.48);
    border-radius: 50%;
  }
  .portrait-ring::after {
    content: '';
    position: absolute;
    inset: 9px -29px -9px 29px;
    border: 2px solid rgba(238, 127, 152, 0.35);
    border-radius: 50%;
  }
  .portrait {
    position: relative;
    z-index: 2;
    width: 246px;
    height: 246px;
    border: 6px solid var(--cream);
    border-radius: 50%;
    object-fit: cover;
    background: #d9a86f;
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.33);
  }
  .ball {
    position: absolute;
    z-index: 3;
    right: -8px;
    bottom: 6px;
    width: 55px;
    height: 55px;
    overflow: hidden;
    border: 5px solid var(--night);
    border-radius: 50%;
    background: var(--lime);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
  }
  .ball::before,
  .ball::after {
    content: '';
    position: absolute;
    width: 42px;
    height: 42px;
    border: 2px solid rgba(30, 48, 12, 0.42);
    border-radius: 50%;
  }
  .ball::before { left: -27px; top: 5px; }
  .ball::after { right: -27px; bottom: 5px; }
  .author-copy {
    position: relative;
    z-index: 1;
    width: 100%;
    min-height: 0;
    margin-top: 28px;
    text-align: center;
  }
  .from {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--pink);
  }
  .author-name {
    margin-top: 9px;
    max-height: 112px;
    overflow: hidden;
    font-size: 39px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -1.25px;
  }
  .author-role {
    margin-top: 14px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255, 247, 237, 0.52);
  }
  .message-panel {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 44px 58px 42px 66px;
    display: grid;
    grid-template-rows: 44px minmax(0, 1fr) 42px;
    color: var(--night);
    background:
      linear-gradient(115deg, rgba(238, 127, 152, 0.045), transparent 38%),
      var(--cream);
  }
  .message-panel::before {
    content: '”';
    position: absolute;
    right: 37px;
    top: -24px;
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 190px;
    line-height: 1;
    color: rgba(238, 127, 152, 0.13);
  }
  .message-label {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #78555f;
  }
  .message-label::before {
    content: '';
    width: 34px;
    height: 3px;
    border-radius: 99px;
    background: var(--pink);
  }
  .message-fit {
    min-height: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  .message-text {
    width: 100%;
    max-height: 100%;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 68px;
    font-weight: 600;
    line-height: 1.19;
    letter-spacing: -1.35px;
    color: #28131d;
  }
  .message-footer {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 28px;
    padding-top: 13px;
    border-top: 1px solid rgba(37, 15, 27, 0.13);
  }
  .message-footer__text {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #8e6b74;
  }
  .racket-mark {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #3c1b28;
  }
  .racket-mark img {
    width: 42px;
    height: 42px;
    object-fit: contain;
  }
  .racket-mark span {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.6px;
    text-transform: uppercase;
  }
  .footer {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .footer__location,
  .footer__center {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2.2px;
    text-transform: uppercase;
    color: rgba(255, 247, 237, 0.55);
  }
  .footer__location { justify-self: start; }
  .footer__center {
    justify-self: center;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .footer__center::before,
  .footer__center::after {
    content: '';
    width: 36px;
    height: 1px;
    background: rgba(255, 247, 237, 0.25);
  }
  .progress {
    justify-self: end;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .progress strong {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
    color: var(--gold);
  }
  .progress span {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
    color: rgba(255, 247, 237, 0.46);
  }
</style>
</head>
<body>
  <div class="card">
    <div class="court"></div>
    <div class="service-line"></div>
    <div class="halo"></div>

    <header class="header">
      <div class="identity">
        <img src="${logoDataUri}" alt="">
        <div>
          <div class="identity__brand">BANDEJA</div>
          <div class="identity__sub">SPORTS</div>
        </div>
      </div>
      <div class="series">С ДНЕМ РОЖДЕНИЯ!</div>
      <div class="date">Лиза · С днём рождения<span>02 августа 2026</span></div>
    </header>

    <main class="wish-shell">
      <aside class="author">
        <div class="wish-number">
          <span>Поздравление</span>
          <strong>${cardNumber} / ${cardTotal}</strong>
        </div>
        <div class="portrait-wrap">
          <div class="portrait-ring"></div>
          <img class="portrait" src="${avatarDataUri}" alt="">
          <div class="ball"></div>
        </div>
        <div class="author-copy">
          <div class="from">С любовью, от</div>
          <div class="author-name">${displayName}</div>
          <div class="author-role">Bandeja padel community</div>
        </div>
      </aside>

      <section class="message-panel">
        <div class="message-label">Пожелание для Лизы</div>
        <div class="message-fit">
          <div class="message-text">${message}</div>
        </div>
        <div class="message-footer">
          <div class="message-footer__text">Собрано на корте · сказано от сердца</div>
          <div class="racket-mark">
            <img src="${padelIconDataUri}" alt="">
            <span>Padel brings us together</span>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="footer__location">Novi Sad · Serbia</div>
      <div class="footer__center">Для Лизы · от всех нас</div>
      <div class="progress"><strong>${cardNumber}</strong><span>/ ${cardTotal}</span></div>
    </footer>
  </div>
<script>
  window.__fitCard = () => {
    const message = document.querySelector('.message-text');
    const messageFit = document.querySelector('.message-fit');
    const authorName = document.querySelector('.author-name');
    const card = document.querySelector('.card');

    const length = message.textContent.trim().length;
    let messageFont = 68;
    message.style.fontSize = messageFont + 'px';
    message.style.letterSpacing = Math.max(-1.35, -messageFont * 0.018) + 'px';

    while (
      messageFont > 25 &&
      (message.scrollHeight > messageFit.clientHeight ||
        message.scrollWidth > messageFit.clientWidth)
    ) {
      messageFont -= 1;
      message.style.fontSize = messageFont + 'px';
      message.style.letterSpacing = Math.max(-1.35, -messageFont * 0.018) + 'px';
    }

    let authorFont = 39;
    authorName.style.fontSize = authorFont + 'px';
    while (
      authorFont > 27 &&
      (authorName.scrollHeight > authorName.clientHeight ||
        authorName.scrollWidth > authorName.clientWidth)
    ) {
      authorFont -= 1;
      authorName.style.fontSize = authorFont + 'px';
    }

    const cardRect = card.getBoundingClientRect();
    const primary = Array.from(card.querySelectorAll('.header, .wish-shell, .footer'));
    window.__renderStats = {
      author: authorName.textContent.trim(),
      authorFontPx: Number.parseFloat(getComputedStyle(authorName).fontSize),
      message: message.textContent.trim(),
      messageFontPx: Number.parseFloat(getComputedStyle(message).fontSize),
      messageLength: length,
      messageOverflow:
        message.scrollHeight > messageFit.clientHeight ||
        message.scrollWidth > messageFit.clientWidth,
      contentOverflow: primary.some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < cardRect.left ||
          rect.top < cardRect.top ||
          rect.right > cardRect.right ||
          rect.bottom > cardRect.bottom
        );
      }),
      avatarLoaded: document.querySelector('.portrait').complete &&
        document.querySelector('.portrait').naturalWidth > 0,
    };
  };
</script>
</body>
</html>`;
}

async function createRenderSession() {
  const [logoDataUri, padelIconDataUri, fontDataUris] = await Promise.all([
    buildLogoDataUri(),
    buildPadelIconDataUri(),
    buildFontDataUris(),
  ]);
  const avatarCache = new Map();
  const browser = await chromium.launch();
  let closed = false;

  return {
    async renderCard({ wish, index, total, outputPath }) {
      if (closed) throw new Error('Render session is already closed');
      if (!wish || !Number.isInteger(index) || index < 0 || index >= total) {
        throw new Error('Invalid wish render request');
      }

      let avatarDataUri = avatarCache.get(wish.avatarUrl || wish.displayName);
      if (!avatarDataUri) {
        avatarDataUri = await buildAvatarDataUri(wish);
        avatarCache.set(wish.avatarUrl || wish.displayName, avatarDataUri);
      }

      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 2,
      });
      try {
        await page.setContent(
          buildHtml({
            avatarDataUri,
            fontDataUris,
            index,
            logoDataUri,
            padelIconDataUri,
            total,
            wish,
          }),
          { waitUntil: 'load' }
        );
        await page.evaluate(async () => {
          await Promise.all([
            document.fonts.load('800 39px Manrope', 'Denis Kotenko'),
            document.fonts.load('600 34px Manrope', 'С днём рождения, Лиза'),
            document.fonts.load('600 25px Playfair Display', 'BANDEJA'),
          ]);
          await document.fonts.ready;
        });

        const fontsLoaded = await page.evaluate(
          () =>
            document.fonts.check('800 39px Manrope', 'Denis Kotenko') &&
            document.fonts.check('600 34px Manrope', 'С днём рождения, Лиза')
        );
        if (!fontsLoaded) throw new Error('Required card fonts did not load');

        await page.evaluate(() => window.__fitCard());
        const stats = await page.evaluate(() => window.__renderStats);
        if (stats.author !== wish.displayName.trim()) {
          throw new Error(`Author mismatch for card ${index + 1}`);
        }
        if (stats.message !== wish.message.trim()) {
          throw new Error(`Message mismatch for card ${index + 1}`);
        }
        if (!stats.avatarLoaded) {
          throw new Error(`Avatar failed to render for card ${index + 1}`);
        }
        if (stats.messageOverflow || stats.contentOverflow) {
          throw new Error(
            `Layout overflow on card ${index + 1}: message=${stats.messageOverflow} ` +
              `content=${stats.contentOverflow}`
          );
        }
        if (stats.messageFontPx < 25 || stats.authorFontPx < 27) {
          throw new Error(
            `Typography fell below minimum on card ${index + 1}: ` +
              `message=${stats.messageFontPx}px author=${stats.authorFontPx}px`
          );
        }

        const screenshot = await page.screenshot({ type: 'png' });
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await sharp(screenshot)
          .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
          .withMetadata({ density: DENSITY })
          .png({ compressionLevel: 9 })
          .toFile(outputPath);

        const metadata = await sharp(outputPath).metadata();
        if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
          throw new Error(
            `Unexpected output size on card ${index + 1}: ` +
              `${metadata.width}x${metadata.height}`
          );
        }
        return { metadata, stats };
      } finally {
        await page.close();
      }
    },

    async close() {
      if (!closed) {
        closed = true;
        await browser.close();
      }
    },
  };
}

async function renderSelectedWish() {
  const wishes = await fetchWishes();
  const index = resolveIndex(wishes.length);
  const outputPath = path.join(OUTPUT_DIR, cardFilename(index));
  const session = await createRenderSession();
  try {
    const { stats } = await session.renderCard({
      wish: wishes[index],
      index,
      total: wishes.length,
      outputPath,
    });
    console.log(
      `Rendered ${cardFilename(index)} — ${wishes[index].displayName} ` +
        `(${stats.messageFontPx}px message)\n${outputPath}`
    );
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  renderSelectedWish().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  OUTPUT_DIR,
  cardFilename,
  createRenderSession,
  fetchWishes,
};
