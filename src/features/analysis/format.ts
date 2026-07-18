import type { Language } from '../../i18n';

export function formatDecimal(
  language: Language,
  value: number,
  digits: number,
  signDisplay: 'auto' | 'always' = 'auto',
) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay,
  }).format(value);
}

/** Formats a value expressed in percentage points (for example 94 => 94%). */
export function formatPercent(language: Language, percentagePoints: number) {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percentagePoints / 100);
}

export function formatLapTime(language: Language, milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = (milliseconds - minutes * 60_000) / 1000;
  return `${minutes}:${new Intl.NumberFormat(language, { minimumIntegerDigits: 2, minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(seconds)}`;
}

export function formatSignedSeconds(language: Language, milliseconds: number | null, digits = 3) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return null;
  return `${new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'always' }).format(milliseconds / 1000)} s`;
}
