// Calendar dates are plain 'yyyy-MM-dd' strings. No time zones, no DST drift.
export const pad = (n) => String(n).padStart(2, '0');
export const toIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function parse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}
export const dateToIso = (dt) => toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
export const today = () => dateToIso(new Date());
const utc = (iso) => { const { y, m, d } = parse(iso); return Date.UTC(y, m - 1, d); };
export const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && parse(s).d <= daysInMonth(parse(s).y, parse(s).m) && parse(s).m >= 1 && parse(s).m <= 12;

/** a - b in whole days. */
export const dayDiff = (a, b) => Math.round((utc(a) - utc(b)) / 86400000);
export function addDays(iso, n) {
  const t = new Date(utc(iso) + n * 86400000);
  return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Adds months, clamping to month end but always measuring from the anchor day. */
export function addMonthsClamped(iso, n, anchorDay) {
  const { y, m, d } = parse(iso);
  const ad = anchorDay ?? d;
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12 + 1;
  return toIso(ny, nm, Math.min(ad, daysInMonth(ny, nm)));
}
export const dow = (iso) => new Date(utc(iso)).getUTCDay(); // 0 = Sunday
/** first: 1 = Monday ... 7 = Sunday */
export function startOfWeek(iso, first = 1) {
  const d = dow(iso) || 7;
  return addDays(iso, -((d - first + 7) % 7));
}
export const monthKey = (iso) => iso.slice(0, 7);
export const firstOfMonth = (iso) => iso.slice(0, 8) + '01';
export function monthsBetween(a, b) { // whole months from a to b by calendar month
  const A = parse(a), B = parse(b);
  return (B.y - A.y) * 12 + (B.m - A.m);
}

/** Budget/overview periods. monthStart 1..28 moves the "month" boundary (e.g. payday). */
export function periodFor(iso, monthStart = 1) {
  const { y, m, d } = parse(iso);
  const s = Math.min(Math.max(monthStart, 1), 28);
  const startMonthIdx = y * 12 + (m - 1) - (d >= s ? 0 : 1);
  return periodAt(startMonthIdx, s);
}
export function periodAt(idx, s) {
  const y = Math.floor(idx / 12), m = idx % 12 + 1;
  const ey = Math.floor((idx + 1) / 12), em = (idx + 1) % 12 + 1;
  return { idx, start: toIso(y, m, s), endExclusive: toIso(ey, em, s), year: y, month: m, monthStart: s };
}
export const shiftPeriod = (p, n) => periodAt(p.idx + n, p.monthStart);
export const inRange = (iso, start, endExclusive) => iso >= start && iso < endExclusive;
export const monthName = (y, m, locale) =>
  new Intl.DateTimeFormat(locale || undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
export const weekdayShort = (dowIdx, locale) =>
  new Intl.DateTimeFormat(locale || undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dowIdx))); // 2023-01-01 is Sunday
export function formatDate(iso, locale, opts = { day: 'numeric', month: 'short' }) {
  const { y, m, d } = parse(iso);
  return new Intl.DateTimeFormat(locale || undefined, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
export const formatDateLong = (iso, locale) => formatDate(iso, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
