const DEV_BG = '#b91c1c';
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

/** Tint the browser tab favicon with a red background in Vite DEV. */
export function applyDevFavicon(): void {
  if (!import.meta.env.DEV) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEV_BG;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    setIconHref(canvas.toDataURL('image/png'));
  };
  img.src = SOURCE;
}
