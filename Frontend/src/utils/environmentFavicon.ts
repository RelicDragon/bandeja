const DEV_BACKGROUND = '#b91c1c';
const TEST_PRODUCTION_BACKGROUND = '#facc15';
const SOURCE = '/favicon/favicon-96x96.png';
const SIZE = 96;

function setIconHref(href: string): void {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]',
  );
  for (const link of links) {
    link.href = href;
  }
}

function applyFaviconBackground(background: string): void {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    setIconHref(canvas.toDataURL('image/png'));
  };
  img.src = SOURCE;
}

export function applyDevFavicon(): void {
  applyFaviconBackground(DEV_BACKGROUND);
}

export function applyTestProductionFavicon(): void {
  applyFaviconBackground(TEST_PRODUCTION_BACKGROUND);
}
