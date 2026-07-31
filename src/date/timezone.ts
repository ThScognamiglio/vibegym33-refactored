/**
 * Converts a Date object to an ISO 8601 string representing local time,
 * returning YYYY-MM-DDTHH:mm:ss.sssZ where components are in the local timezone.
 */
export function toLocalISOString(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString();
}

/**
 * Extracts YYYY-MM-DD safely from a Date or string without UTC date shifting.
 * Supports ISO strings, YYYY-MM-DD, and legacy DD/MM/YYYY formats.
 */
export function getLocalDatePart(dateInput: Date | string): string {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    return toLocalISOString(dateInput).split('T')[0];
  }
  if (typeof dateInput === 'string') {
    // Legacy format: DD/MM/YYYY
    if (dateInput.includes('/')) {
      const [d, m, y] = dateInput.split('/').map(Number);
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    // ISO string with T
    if (dateInput.includes('T')) {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        return toLocalISOString(d).split('T')[0];
      }
    }
    // Fallback: split by space or T
    return dateInput.split(/[ T]/)[0];
  }
  return '';
}

/**
 * Returns YYYY-MM-DD in the local timezone for today.
 */
export function getLocalTodayString(): string {
  return toLocalISOString(new Date()).split('T')[0];
}

/**
 * Returns YYYY-MM-DD in the local timezone for tomorrow.
 */
export function getLocalTomorrowString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalISOString(tomorrow).split('T')[0];
}
