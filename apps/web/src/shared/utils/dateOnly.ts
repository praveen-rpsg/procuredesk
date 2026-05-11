const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateOnlyPrefixPattern = /^(\d{4}-\d{2}-\d{2})/;
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DateOnlyParts = {
  day: number;
  month: number;
  year: number;
};

export function parseDateOnlyParts(value: string | null | undefined): DateOnlyParts | null {
  if (!value) return null;
  const match = dateOnlyPattern.exec(value);
  if (!match) return null;
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

export function isDateOnlyString(value: string): boolean {
  const parts = parseDateOnlyParts(value);
  if (!parts) return false;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return (
    date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day
  );
}

export function toDateOnlyInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = dateOnlyPrefixPattern.exec(value);
  if (!match) return "";
  const dateValue = match[1] ?? "";
  return isDateOnlyString(dateValue) ? dateValue : "";
}

export function addDaysToDateOnly(value: string, days: number): string {
  const parts = parseDateOnlyParts(value);
  if (!parts || !isDateOnlyString(value)) return value;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + days);
  return formatDateOnlyParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function formatDateOnly(value: string | null | undefined, emptyValue = "-"): string {
  const dateValue = toDateOnlyInputValue(value);
  if (!dateValue) return value ? String(value) : emptyValue;
  const parts = parseDateOnlyParts(dateValue);
  if (!parts) return emptyValue;
  return `${parts.day} ${shortMonths[parts.month - 1]} ${parts.year}`;
}

export function dateOnlyToLocalDate(value: string | null | undefined): Date | null {
  const dateValue = toDateOnlyInputValue(value);
  const parts = parseDateOnlyParts(dateValue);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

export function todayDateOnlyString(date = new Date()): string {
  return formatDateOnlyParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function formatDateOnlyParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
