import { addDays, addMonthsClamped, parse, monthsBetween, dayDiff } from './dates.js';

export const UNITS = ['day', 'week', 'month', 'year'];

/** n-th occurrence (n = 0 is the start date), always computed from the original anchor day. */
export function occurrence(start, unit, every, n) {
  switch (unit) {
    case 'day': return addDays(start, every * n);
    case 'week': return addDays(start, 7 * every * n);
    case 'month': return addMonthsClamped(start, every * n, parse(start).d);
    case 'year': return addMonthsClamped(start, 12 * every * n, parse(start).d);
    default: throw new Error('bad unit ' + unit);
  }
}

function approxIndex(start, unit, every, date) {
  if (date <= start) return 0;
  switch (unit) {
    case 'day': return Math.floor(dayDiff(date, start) / every);
    case 'week': return Math.floor(dayDiff(date, start) / (7 * every));
    case 'month': return Math.floor(monthsBetween(start, date) / every);
    default: return Math.floor(monthsBetween(start, date) / (12 * every));
  }
}

/** All occurrences d with from <= d <= to (inclusive), never past rule.endDate. No duplicates. */
export function occurrencesBetween(rule, from, to) {
  const { startDate: start, unit, endDate: end } = rule;
  const every = Math.max(1, rule.every || 1);
  const out = [];
  let n = Math.max(0, approxIndex(start, unit, every, from) - 2);
  let guard = 0;
  while (occurrence(start, unit, every, n) < from) { n++; if (++guard > 100000) return out; }
  for (;;) {
    const d = occurrence(start, unit, every, n);
    if (d > to || (end && d > end)) break;
    out.push(d);
    n++;
    if (++guard > 100000) break;
  }
  return out;
}

export function nextOnOrAfter(rule, date) {
  const far = addDays(date, 366 * 5 + 40);
  const list = occurrencesBetween(rule, date, far);
  return list.length ? list[0] : null;
}

export function describeRecurrence(unit, every) {
  if (every <= 1) return { day: 'Every day', week: 'Every week', month: 'Every month', year: 'Every year' }[unit];
  return `Every ${every} ${unit}s`;
}
