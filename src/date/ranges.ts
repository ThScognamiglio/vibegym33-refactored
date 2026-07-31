import { getLocalDatePart } from './timezone';

/**
 * Gets the start of the week (Monday) in local time.
 */
export function getWeekStart(d: Date | string): Date {
  const datePart = getLocalDatePart(d);
  const date = new Date(datePart);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 is Sunday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  date.setDate(diff);
  return date;
}

/**
 * Gets the end of the week (Sunday) in local time.
 */
export function getWeekEnd(d: Date | string): Date {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Gets the start of the month in local time.
 */
export function getMonthStart(d: Date | string): Date {
  const datePart = getLocalDatePart(d);
  const date = new Date(datePart);
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Gets the end of the month in local time.
 */
export function getMonthEnd(d: Date | string): Date {
  const datePart = getLocalDatePart(d);
  const date = new Date(datePart);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Gets a list of months in YYYY-MM format between fromDate and toDate.
 */
export function getPastMonths(fromDate: Date | string, toDate: Date | string = new Date()): string[] {
  const fromPart = getLocalDatePart(fromDate);
  const toPart = getLocalDatePart(toDate);
  const from = new Date(fromPart);
  const to = new Date(toPart);
  
  const months: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  while (d < to) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

/**
 * Gets an array of Dates representing all days within the specified range (inclusive).
 */
export function getDaysInRange(startDate: Date | string, endDate: Date | string): Date[] {
  const startPart = getLocalDatePart(startDate);
  const endPart = getLocalDatePart(endDate);
  const start = new Date(startPart);
  const end = new Date(endPart);
  
  const days: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
