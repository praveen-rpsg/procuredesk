const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateOnlyPrefixPattern = /^(\d{4}-\d{2}-\d{2})/;

export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDateOnlyParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }
  const dateValue = dateOnlyPrefixPattern.exec(value)?.[1];
  return dateValue && isDateOnlyString(dateValue) ? dateValue : value;
}

export function isDateOnlyString(value: string): boolean {
  const parts = parseDateOnlyParts(value);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

export function addDaysToDateOnly(value: string, days: number): string {
  const parts = parseDateOnlyParts(value);
  if (!parts || !isDateOnlyString(value)) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayDateOnlyString(date = new Date()): string {
  return formatDateOnlyParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function diffDateOnlyDays(laterValue: string, earlierValue: string): number | null {
  const later = dateOnlyToUtcDate(laterValue);
  const earlier = dateOnlyToUtcDate(earlierValue);
  if (!later || !earlier) return null;
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

export function dateOnlyToUtcDate(value: string): Date | null {
  const parts = parseDateOnlyParts(value);
  if (!parts || !isDateOnlyString(value)) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function parseDateOnlyParts(value: string): { day: number; month: number; year: number } | null {
  const match = dateOnlyPattern.exec(value);
  if (!match) return null;
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function formatDateOnlyParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
