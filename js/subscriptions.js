// Finds charges that repeat on a regular rhythm with a steady price: subscriptions, memberships, instalments.
// Pure functions: no storage, no screen. Everything is derived from the transactions the app already holds.
import { addDays, dayDiff } from './dates.js';

const PERIODS = [
  { key: 'week', days: 7, tol: 2, min: 4, unit: 'week', every: 1 },
  { key: 'fortnight', days: 14, tol: 3, min: 3, unit: 'week', every: 2 },
  { key: 'month', days: 30.4, tol: 4, min: 3, unit: 'month', every: 1 },
  { key: 'quarter', days: 91, tol: 8, min: 3, unit: 'month', every: 3 },
  { key: 'year', days: 365, tol: 14, min: 2, unit: 'year', every: 1 },
];

/** A stable key for a merchant: letters only, first two real words, lower case. */
export function merchantKey(name) {
  const words = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zäöüõ\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  return words.slice(0, 2).join(' ');
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/**
 * @param txns   all transactions
 * @param rules  existing recurring rules (so tracked ones are marked)
 * @param today  'yyyy-MM-dd'
 * @returns list sorted by yearly cost, biggest first
 */
export function findSubscriptions(txns, rules, today) {
  const groups = new Map();
  for (const t of txns) {
    if (t.type !== 'expense' || !t.name || !(t.amountMinor > 0)) continue;
    const k = merchantKey(t.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const tracked = new Set((rules || []).filter((r) => r.kind === 'expense').map((r) => merchantKey(r.name)));
  const out = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    if (list.length < 2) continue;
    const amounts = list.map((t) => t.amountMinor), mid = median(amounts);
    const steady = list.filter((t) => Math.abs(t.amountMinor - mid) <= mid * 0.25);
    if (steady.length < list.length * 0.7) continue; // prices all over the place: groceries, fuel, coffee
    const dates = steady.map((t) => t.date);
    const gaps = []; for (let i = 1; i < dates.length; i++) gaps.push(dayDiff(dates[i], dates[i - 1]));
    if (!gaps.length) continue;
    const typical = median(gaps);
    const per = PERIODS.find((p) => Math.abs(typical - p.days) <= p.tol);
    if (!per || steady.length < per.min) continue;
    const onBeat = gaps.filter((g) => Math.abs(g - per.days) <= per.tol * 1.6).length;
    if (onBeat < gaps.length * 0.75) continue;
    const last = steady[steady.length - 1];
    const sinceLast = dayDiff(today, last.date);
    const monthly = Math.round((last.amountMinor * 30.4375) / per.days);
    const earlier = median(steady.slice(0, -1).map((t) => t.amountMinor));
    const changed = steady.length >= 3 && Math.abs(last.amountMinor - earlier) > earlier * 0.03;
    out.push({
      key, name: last.name, categoryId: last.categoryId || null, accountId: last.accountId || null,
      amountMinor: last.amountMinor, period: per.key, unit: per.unit, every: per.every, count: steady.length,
      firstDate: steady[0].date, lastDate: last.date, nextDate: addDays(last.date, Math.round(per.days)),
      monthlyMinor: monthly, yearlyMinor: monthly * 12,
      active: sinceLast <= per.days * 1.6 + 5, tracked: tracked.has(key),
      priceChange: changed ? { from: earlier, to: last.amountMinor } : null,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.yearlyMinor - a.yearlyMinor);
}

export function subscriptionTotals(subs) {
  const live = subs.filter((s) => s.active);
  return { count: live.length, monthly: live.reduce((n, s) => n + s.monthlyMinor, 0), yearly: live.reduce((n, s) => n + s.yearlyMinor, 0) };
}
