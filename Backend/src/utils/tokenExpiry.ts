export function expiresInToDate(expiresIn: string): Date {
  const m = /^(\d+)([smhd])$/i.exec(expiresIn.trim().replace(/\s/g, ''));
  if (!m) {
    throw new Error(`Unsupported expires string: ${expiresIn}`);
  }
  const amount = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const deltaMs =
    unit === 's' ? amount * 1000 : unit === 'm' ? amount * 60_000 : unit === 'h' ? amount * 3600_000 : amount * 86400_000;
  return new Date(Date.now() + deltaMs);
}

export function expiresInToMaxAgeSeconds(expiresIn: string): number {
  const d = expiresInToDate(expiresIn);
  return Math.max(60, Math.floor((d.getTime() - Date.now()) / 1000));
}
