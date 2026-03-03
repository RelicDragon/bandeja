export function getTelUrl(phone: string | undefined): string {
  if (!phone || !phone.trim()) return '';
  const cleaned = phone.trim().replace(/[\s.()-]/g, '');
  const digitsAndPlus = cleaned.replace(/[^\d+]/g, '');
  if (!digitsAndPlus.length) return '';
  return `tel:${digitsAndPlus}`;
}
