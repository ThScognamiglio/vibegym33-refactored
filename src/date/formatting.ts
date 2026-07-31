import { getLocalDatePart, getLocalTodayString } from './timezone';

/**
 * Formats a date to DD/MM/YYYY.
 */
export function formatToDDMMYYYY(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const [y, m, d] = datePart.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Formats a date to a friendly string like "Oggi" / "Today", "Ieri" / "Yesterday", or day of week name.
 */
export function formatFriendlyDate(dateInput: Date | string, t?: (key: string) => string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  
  const today = getLocalTodayString();
  
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalDatePart(yesterdayDate);
  
  if (datePart === today) {
    if (t) {
      const translated = t('today');
      if (translated && translated !== 'today') return translated;
    }
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'it';
    return lang.startsWith('it') ? 'Oggi' : 'Today';
  }
  
  if (datePart === yesterday) {
    if (t) {
      const translated = t('yesterday');
      if (translated && translated !== 'yesterday') return translated;
    }
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'it';
    return lang.startsWith('it') ? 'Ieri' : 'Yesterday';
  }
  
  const d = new Date(datePart);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * Formats date to a short weekday and day number (e.g., "Lun 4" or "Mon 4").
 */
export function formatShortWeekdayDay(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const d = new Date(datePart);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/**
 * Formats date to short month and day number (e.g., "Gen 4" or "Jan 4").
 */
export function formatShortMonthDay(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const d = new Date(datePart);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Formats date to long localized format (e.g., "lunedì 4 giugno 2026").
 */
export function formatLongDate(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const d = new Date(datePart);
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Formats date to short weekday, short month and day number (e.g., "Lun 4 Gen" or "Mon Jan 4").
 */
export function formatShortWeekdayMonthDay(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const d = new Date(datePart);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Formats date to standard locale date string.
 */
export function formatToLocaleDate(dateInput: Date | string): string {
  const datePart = getLocalDatePart(dateInput);
  if (!datePart) return '';
  const d = new Date(datePart);
  return d.toLocaleDateString();
}
