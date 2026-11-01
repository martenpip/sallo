// Pure functions over plain data. No DOM, no storage.
import { addDays, dayDiff, startOfWeek, inRange, parse, monthsBetween, firstOfMonth, daysInMonth, toIso, dow, today } from './dates.js';

export const isExpenseLike = (kind) => kind === 'expense';

export function accountBalances(accounts, txns) {
  const bal = new Map(accounts.map((a) => [a.id, a.openingMinor || 0]));
  const add = (id, v) => { if (bal.has(id)) bal.set(id, bal.get(id) + v); };
  for (const t of txns) {
    if (t.type === 'income') add(t.accountId, t.amountMinor);
    else if (t.type === 'expense') add(t.accountId, -t.amountMinor);
    else if (t.type === 'transfer') { add(t.accountId, -t.amountMinor); add(t.toAccountId, t.amountMinor); }
  }
  return bal;
}

export function totalBalance(accounts, balances) {
  let sum = 0;
  for (const a of accounts) if (!a.archived && !a.excludeFromTotal) sum += balances.get(a.id) || 0;
  return sum;
}

export function periodTotals(txns, start, endExclusive) {
  let income = 0, expense = 0;
  for (const t of txns) {
    if (!inRange(t.date, start, endExclusive)) continue;
    if (t.type === 'income') income += t.amountMinor;
    else if (t.type === 'expense') expense += t.amountMinor;
  }
  return { income, expense, net: income - expense };
}

export function expenseByCategory(txns, start, endExclusive) {
  const m = new Map();
  for (const t of txns) {
    if (t.type !== 'expense' || !inRange(t.date, start, endExclusive)) continue;
    const k = t.categoryId || '';
    m.set(k, (m.get(k) || 0) + t.amountMinor);
  }
  return [...m].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
}

export function mostExpensiveDay(txns, start, endExclusive) {
  const m = new Map();
  for (const t of txns) {
    if (t.type !== 'expense' || !inRange(t.date, start, endExclusive)) continue;
    m.set(t.date, (m.get(t.date) || 0) + t.amountMinor);
  }
  let best = null;
  for (const [date, total] of m) if (!best || total > best.total) best = { date, total };
  return best;
}

/** Budget for a category (or the whole period when categoryId is empty). */
export function budgetStatus(budget, txns, start, endExclusive) {
  let spent = 0;
  for (const t of txns) {
    if (t.type !== 'expense' || !inRange(t.date, start, endExclusive)) continue;
    if (!budget.categoryId || t.categoryId === budget.categoryId) spent += t.amountMinor;
  }
  const limit = budget.limitMinor;
  const pct = limit > 0 ? Math.round((spent * 100) / limit) : 0;
  const state = spent > limit ? 'over' : pct >= 80 ? 'near' : 'ok';
  return { spent, limit, remaining: limit - spent, pct, state };
}

export function displayStatus(p, todayIso) {
  if (p.status === 'done') return 'paid';
  if (p.status === 'skipped') return 'skipped';
  if (p.kind === 'event') return p.date < todayIso ? 'past' : p.date === todayIso ? 'due' : 'upcoming';
  if (p.date < todayIso) return 'overdue';
  if (p.date === todayIso) return 'due';
  return 'upcoming';
}

export const GROUPS = ['overdue', 'today', 'tomorrow', 'week', 'nextweek', 'month', 'later'];
export const GROUP_LABEL = {
  overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This week',
  nextweek: 'Next week', month: 'Later this month', later: 'Later',
};

export function groupFor(date, todayIso, weekStart = 1) {
  if (date < todayIso) return 'overdue';
  const d = dayDiff(date, todayIso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  const ws = startOfWeek(todayIso, weekStart);
  const thisWeekEnd = addDays(ws, 7);   // exclusive
  const nextWeekEnd = addDays(ws, 14);
  if (date < thisWeekEnd) return 'week';
  if (date < nextWeekEnd) return 'nextweek';
  if (date.slice(0, 7) === todayIso.slice(0, 7)) return 'month';
  return 'later';
}

/** Items that need attention, grouped and sorted. Paid/skipped are excluded unless includeDone. */
export function groupUpcoming(items, todayIso, weekStart = 1, { includeDone = false } = {}) {
  const groups = new Map(GROUPS.map((g) => [g, []]));
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const st = displayStatus(p, todayIso);
    if (!includeDone && (st === 'paid' || st === 'skipped' || st === 'past')) continue;
    groups.get(groupFor(p.date, todayIso, weekStart)).push(p);
  }
  return GROUPS.map((g) => ({ key: g, label: GROUP_LABEL[g], items: groups.get(g) })).filter((g) => g.items.length);
}

/** Totals of pending money items in a window. Events have no amount. */
export function pendingTotals(planned, from, toInclusive) {
  let out = 0, inc = 0;
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind === 'event') continue;
    if (p.date < from || p.date > toInclusive) continue;
    if (p.kind === 'expense') out += p.amountMinor; else if (p.kind === 'income') inc += p.amountMinor;
  }
  return { out, inc };
}

export function overdueTotals(planned, todayIso) {
  let out = 0, inc = 0, count = 0;
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind === 'event' || p.date >= todayIso) continue;
    count++;
    if (p.kind === 'expense') out += p.amountMinor; else inc += p.amountMinor;
  }
  return { out, inc, count };
}

/** Expected balance at `end` if every pending item up to then happens as planned. */
export function forecast(currentBalance, planned, todayIso, endInclusive) {
  let b = currentBalance;
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind === 'event' || p.date > endInclusive) continue;
    b += p.kind === 'income' ? p.amountMinor : -p.amountMinor;
  }
  return b;
}

export function goalProgress(goal, contribs, todayIso) {
  let saved = 0;
  for (const c of contribs) if (c.goalId === goal.id) saved += c.amountMinor;
  const target = goal.targetMinor;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.floor((saved * 100) / target))) : 0;
  const remaining = Math.max(0, target - saved);
  let perMonth = null;
  if (goal.deadline && remaining > 0 && todayIso) {
    const months = Math.max(1, monthsBetween(firstOfMonth(todayIso), firstOfMonth(goal.deadline)));
    if (goal.deadline >= todayIso) perMonth = Math.ceil(remaining / months);
  }
  return { saved, pct, remaining, done: target > 0 && saved >= target, perMonth };
}

/** How much to suggest setting aside for one goal when `incomeMinor` arrives. Always a suggestion, never automatic. */
export function suggestSaving(goal, contribs, incomeMinor, todayIso, incomesPerMonth = 1, defaultPct = 10) {
  const gp = goalProgress(goal, contribs, todayIso);
  if (gp.done || incomeMinor <= 0) return 0;
  let s;
  if (goal.autoPct > 0) s = Math.round((incomeMinor * goal.autoPct) / 100);
  else if (gp.perMonth) s = Math.ceil(gp.perMonth / Math.max(1, incomesPerMonth));
  else s = Math.round((incomeMinor * defaultPct) / 100);
  return Math.max(0, Math.min(s, gp.remaining, Math.floor(incomeMinor / 2)));
}

export const totalAllocated = (goals, contribs) => {
  const live = new Set(goals.filter((g) => !g.archived).map((g) => g.id));
  return contribs.reduce((s, c) => s + (live.has(c.goalId) ? c.amountMinor : 0), 0);
};

/** Calendar: which days of a month have what. */
export function monthDayMarks(txns, planned, y, m) {
  const prefix = `${y}-${String(m).padStart(2, '0')}-`;
  const marks = new Map();
  const mark = (date, k) => { const o = marks.get(date) || {}; o[k] = true; marks.set(date, o); };
  for (const t of txns) if (t.date.startsWith(prefix)) mark(t.date, 'txn');
  for (const p of planned) {
    if (!p.date.startsWith(prefix) || p.status === 'skipped') continue;
    mark(p.date, p.kind === 'event' ? 'event' : p.status === 'done' ? 'paid' : 'planned');
  }
  return marks;
}

export function monthGrid(y, m, weekStart = 1) {
  const first = toIso(y, m, 1);
  let cur = startOfWeek(first, weekStart);
  const last = toIso(y, m, daysInMonth(y, m));
  const days = [];
  while (cur <= last || days.length % 7 !== 0) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

export function spendingVsPrevious(txns, cur, prev) {
  const a = periodTotals(txns, cur.start, cur.endExclusive).expense;
  const b = periodTotals(txns, prev.start, prev.endExclusive).expense;
  return { cur: a, prev: b, diff: a - b, pct: b > 0 ? Math.round(((a - b) * 100) / b) : null };
}

export { parse };


// ---------- spending guard: needs vs wants ----------
export const ESSENTIAL_DEFAULTS = ['housing', 'bills & utilities', 'groceries', 'health', 'transport'];
/** A category is a priority expense if the person said so, otherwise by its everyday name. */
export const isEssential = (cat) => (cat ? (typeof cat.essential === 'boolean' ? cat.essential : ESSENTIAL_DEFAULTS.includes(String(cat.name).trim().toLowerCase())) : false);

/**
 * Looks at one period and the next 30 days. Never blocks anything; it only describes.
 * Uncategorised spending counts as neither a need nor a want.
 */
export function spendingGuard({ txns, planned, categories, accounts, goals, contribs }, { start, endExclusive, today: t, addDaysFn, limitPct = 30, expectedIncome = 0, workIncome: workIn = 0 }) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  let essentialSpent = 0, wantsSpent = 0, income = 0;
  const wantsBy = new Map();
  for (const x of txns) {
    if (x.date < start || x.date >= endExclusive) continue;
    if (x.type === 'income') { income += x.amountMinor; continue; }
    if (x.type !== 'expense') continue;
    const c = cat.get(x.categoryId);
    if (!c) continue;
    if (isEssential(c)) essentialSpent += x.amountMinor;
    else { wantsSpent += x.amountMinor; wantsBy.set(c.id, (wantsBy.get(c.id) || 0) + x.amountMinor); }
  }
  const horizon = addDaysFn(t, 30);
  let essentialsDue = 0;
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind !== 'expense' || p.date > horizon) continue;
    if (isEssential(cat.get(p.categoryId))) essentialsDue += p.amountMinor;
  }
  const balance = totalBalance(accounts, accountBalances(accounts, txns));
  const available = balance - totalAllocated(goals, contribs);
  const safe = available + workIn - essentialsDue; // work-day pay expected in the next 30 days counts too
  const topWants = [...wantsBy].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total).slice(0, 3);
  const baseIncome = Math.max(income, expectedIncome); // a monthly salary the person told us about counts before it lands
  const wantsPctOfIncome = baseIncome > 0 ? Math.round((wantsSpent * 100) / baseIncome) : null;
  const warnings = [];
  if (essentialsDue > 0 && safe < 0) warnings.push({ code: 'shortfall', level: 'high', short: -safe });
  else if (essentialsDue > 0 && wantsSpent > 0 && safe < essentialsDue * 0.25) warnings.push({ code: 'tight', level: 'watch', left: safe });
  if (baseIncome > 0 && wantsSpent > (baseIncome * limitPct) / 100) warnings.push({ code: 'wants-income', level: wantsSpent > (baseIncome * limitPct * 1.5) / 100 ? 'high' : 'watch', pct: wantsPctOfIncome, limit: limitPct });
  else if (baseIncome <= 0 && wantsSpent > 0 && wantsSpent > essentialSpent && wantsSpent + essentialSpent >= 1) warnings.push({ code: 'wants-share', level: 'watch' });
  return { essentialSpent, wantsSpent, income, wantsPctOfIncome, essentialsDue, available, safe, topWants, warnings };
}


// ---------- safe to spend ----------
/**
 * Money that is really free: balance, minus what is set aside for goals, minus bills that fall due before the
 * next income arrives (or before the period ends if no income is planned). Never negative-clamped, so a shortfall shows.
 */
export function safeToSpend({ accounts, txns, planned, goals, contribs }, t, periodEndExclusive) {
  const balance = totalBalance(accounts, accountBalances(accounts, txns));
  const allocated = totalAllocated(goals, contribs);
  let nextIncome = null;
  for (const p of planned) if (p.status === 'planned' && p.kind === 'income' && p.date > t && dayDiff(p.date, t) <= 45 && (!nextIncome || p.date < nextIncome)) nextIncome = p.date;
  let until = nextIncome || (periodEndExclusive && periodEndExclusive > t ? periodEndExclusive : null);
  if (!nextIncome && until && dayDiff(until, t) < 7) until = addDays(t, 30); // a period about to end says little; look a month ahead
  let bills = 0;
  if (until) for (const p of planned) if (p.status === 'planned' && p.kind === 'expense' && p.date < until) bills += p.amountMinor;
  const days = until ? Math.max(1, dayDiff(until, t)) : 30;
  const safe = balance - allocated - bills;
  const perDay = safe > 0 ? Math.floor(safe / days) : 0;
  return { safe, perDay, perWeek: perDay * 7, days, until, byIncome: !!nextIncome, bills, allocated, balance };
}


// ---------- money plans (needs / wants / savings) ----------
export const PLANS = [
  { id: '50-30-20', name: 'Balanced', needs: 50, wants: 30, save: 20, blurb: 'The classic. Half for needs, a bit of fun, and a solid slice for saving.' },
  { id: '60-30-10', name: 'Comfortable', needs: 60, wants: 30, save: 10, blurb: 'More room for bills and everyday life, a gentler pace of saving.' },
  { id: '70-20-10', name: 'Tight budget', needs: 70, wants: 20, save: 10, blurb: 'When bills take a big share. Keeps a little for fun and a little for savings.' },
  { id: '40-30-30', name: 'Save more', needs: 40, wants: 30, save: 30, blurb: 'For lower bills or big goals. Builds savings fastest.' },
];
export const planById = (id) => PLANS.find((x) => x.id === id) || null;
/** Splits a monthly income by a plan's percentages. Savings takes the rounding remainder so the parts always add up. */
export function planSplit(incomeMinor, plan) {
  const needs = Math.round((incomeMinor * plan.needs) / 100), wants = Math.round((incomeMinor * plan.wants) / 100);
  return { needs, wants, save: incomeMinor - needs - wants };
}
/** A repeating item as a monthly amount. */
export function monthlyOf(rule) {
  if (!rule || !rule.amountMinor) return 0;
  const every = rule.every || 1;
  const perYear = rule.unit === 'month' ? 12 / every : rule.unit === 'week' ? 52 / every : rule.unit === 'day' ? 365 / every : rule.unit === 'year' ? 1 / every : 0;
  return Math.round((rule.amountMinor * perYear) / 12);
}
/** Regular essential bills per month, from repeating items in priority categories. */
export function fixedEssentialsMonthly(rules, categories) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  return rules.filter((r) => !r.paused && r.kind === 'expense' && isEssential(cat.get(r.categoryId))).reduce((n, r) => n + monthlyOf(r), 0);
}
/** The first preset whose needs share covers the given share of income, else the last. */
export function fittingPlan(needsPct) { return PLANS.slice().sort((a, b) => a.needs - b.needs).find((x) => x.needs >= needsPct) || PLANS.find((x) => x.id === '70-20-10'); }


// ---------- paid per work day, and the money timeline ----------
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5]; // ISO: Monday = 1 ... Sunday = 7
/** Is this date a day the person works (and so earns their daily pay)? */
export function isWorkDay(wp, iso) {
  if (!wp || !wp.dailyMinor) return false;
  if ((wp.extra || []).includes(iso)) return true; // a day they chose to work on top of the usual pattern
  const w = dow(iso) || 7;
  return wp.weekdays.includes(w) && !(wp.off || []).includes(iso);
}
/** Work days per month on average, from the weekdays they work (ignores days off). */
/** Pay from work days after `from` up to and including `to`. */
export function workIncome(wp, from, to) {
  if (!wp || !wp.dailyMinor) return 0;
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkDay(wp, d)) n += wp.dailyMinor;
  return n;
}
export const workDaysPerMonth = (wp) => (wp ? Math.round((wp.weekdays.length * 52) / 12 * 10) / 10 : 0);
export function monthlyFromWork(wp) {
  if (!wp || !wp.dailyMinor) return 0;
  if (wp.weekdays.length) return Math.round((wp.dailyMinor * wp.weekdays.length * 52) / 12);
  const t0 = today(), t1 = addDays(t0, 30); // only hand-picked days: count the ones in the next month
  return wp.dailyMinor * (wp.extra || []).filter((x) => x >= t0 && x <= t1).length;
}

/**
 * Walks day by day from tomorrow to `to`: bills and planned income on their dates, then the day's work pay.
 * Overdue items are counted today. Returns the story in steps, so it can be shown the way a person thinks:
 * "work 8 days, then the dentist, work 4 more days, then rent and bills".
 */
export function projectCashflow({ accounts, txns, planned, workPay, skipRuleId }, from, to) {
  const start = totalBalance(accounts, accountBalances(accounts, txns));
  const byDate = new Map();
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind === 'event' || !p.amountMinor) continue;
    if (skipRuleId && p.ruleId === skipRuleId) continue; // regular salary is not counted while pay per work day is on
    if (p.date > to) continue;
    const d = p.date < from ? from : p.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(p);
  }
  let bal = start, min = { balance: start, date: from }, workDays = 0, workTotal = 0;
  const steps = []; // {type:'work', days, total, from, to} | {type:'bills', date, items, net, balanceBefore, balanceAfter}
  let runStart = null, last = from;
  const closeRun = (endDate) => { if (workDays > 0) { steps.push({ type: 'work', days: workDays, total: workTotal, from: runStart, to: endDate, balanceAfter: bal }); } workDays = 0; workTotal = 0; runStart = null; };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = byDate.get(d);
    if (items && items.length) {
      closeRun(addDays(d, -1));
      const before = bal;
      let net = 0;
      for (const p of items) net += p.kind === 'income' ? p.amountMinor : -p.amountMinor;
      bal += net;
      steps.push({ type: 'bills', date: d, items: items.map((p) => ({ id: p.id, name: p.name, kind: p.kind, amountMinor: p.amountMinor })), net, balanceBefore: before, balanceAfter: bal, short: bal < 0 ? -bal : 0 });
      if (bal < min.balance) min = { balance: bal, date: d };
    }
    if (d > from && isWorkDay(workPay, d)) { if (!runStart) runStart = d; workDays += 1; workTotal += workPay.dailyMinor; bal += workPay.dailyMinor; }
    last = d;
  }
  closeRun(last);
  const firstShort = steps.find((x) => x.type === 'bills' && x.short > 0) || null;
  let needDays = null;
  if (firstShort && workPay && workPay.dailyMinor) needDays = Math.ceil(firstShort.short / workPay.dailyMinor);
  return { start, steps, end: bal, min, firstShort, needDays, from, to };
}

/** Safe to spend when pay comes per work day: the lowest the balance gets over the next `days`, less what is set aside. */
export function safeToSpendProjected(data, t, days = 30) {
  const to = addDays(t, days);
  const pr = projectCashflow(data, t, to);
  const allocated = totalAllocated(data.goals, data.contribs);
  const safe = pr.min.balance - allocated;
  return { safe, perDay: safe > 0 ? Math.floor(safe / days) : 0, perWeek: safe > 0 ? Math.floor(safe / days) * 7 : 0, days, lowDate: pr.min.date, allocated, balance: pr.start, projection: pr };
}


// ---------- debts and loans ----------
/** How much of a debt has been paid: repayments recorded by hand plus paid items of its repeating payment. Interest or extra borrowing is a negative repayment. */
export function debtPaid(debt, repayments, planned = []) {
  let n = 0;
  for (const r of repayments) if (r.debtId === debt.id) n += r.amountMinor;
  if (debt.ruleId) for (const p of planned) if (p.ruleId === debt.ruleId && p.status === 'done') n += p.amountMinor;
  return n;
}
export const debtLeft = (debt, repayments, planned = []) => Math.max(0, debt.startMinor - debtPaid(debt, repayments, planned));
/** Months to clear `left` paying `monthly` a month at `aprBp` (basis points a year, interest added monthly). */
export function payoffPlan(left, aprBp, monthly) {
  if (left <= 0) return { months: 0, interest: 0, never: false };
  if (!monthly || monthly <= 0) return { months: null, interest: 0, never: true, noPayment: true };
  let bal = left, months = 0, interest = 0;
  while (bal > 0 && months < 1200) {
    const i = Math.round((bal * aprBp) / 12 / 10000);
    if (months === 0 && monthly <= i) return { months: null, interest: 0, never: true };
    bal += i; interest += i;
    bal -= Math.min(monthly, bal);
    months += 1;
  }
  return bal > 0 ? { months: null, interest, never: true } : { months, interest, never: false };
}
export function debtTotals(debts, repayments, planned = []) {
  let owe = 0, owed = 0, nOwe = 0, nOwed = 0;
  for (const d of debts) { if (d.archived) continue; const left = debtLeft(d, repayments, planned); if (!left) continue; if (d.direction === 'owed') { owed += left; nOwed++; } else { owe += left; nOwe++; } }
  return { owe, owed, nOwe, nOwed };
}

// ---------- "Can I afford this?" ----------
/** Balance at the end of each day from `from` to `to`: bills and planned income on their dates, work-day pay after them. */
export function dailyBalances({ accounts, txns, planned, workPay, skipRuleId }, from, to) {
  let bal = totalBalance(accounts, accountBalances(accounts, txns));
  const net = new Map();
  for (const p of planned) {
    if (p.status !== 'planned' || p.kind === 'event' || !p.amountMinor || (skipRuleId && p.ruleId === skipRuleId) || p.date > to) continue;
    const d = p.date < from ? from : p.date;
    net.set(d, (net.get(d) || 0) + (p.kind === 'income' ? p.amountMinor : -p.amountMinor));
  }
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    bal += net.get(d) || 0;
    if (d > from && isWorkDay(workPay, d)) bal += workPay.dailyMinor;
    out.push({ date: d, balance: bal });
  }
  return out;
}
/**
 * Would a purchase of `price` on `date` leave you OK? Looks 45 days past the purchase, counts planned bills and income
 * (and work-day pay), and keeps money set aside for goals untouched. `cushion` is a little room that should remain.
 */
export function affordCheck(data, { price, date, today: t, allocated = 0, cushion = 0 }) {
  const HORIZON = 45, SEARCH = 90;
  const series = dailyBalances(data, t, addDays(t, SEARCH + HORIZON));
  const safeAfter = (c) => {
    const end = addDays(c, HORIZON);
    let min = Infinity;
    for (const x of series) { if (x.date > end) break; const b = x.date >= c ? x.balance - price : x.balance; if (b < min) min = b; }
    return min - allocated;
  };
  let baseMin = Infinity, baseDay = t;
  for (const x of series) { if (x.date > addDays(date, HORIZON)) break; if (x.balance < baseMin) { baseMin = x.balance; baseDay = x.date; } }
  const after = safeAfter(date);
  const verdict = after >= cushion ? 'yes' : after >= 0 ? 'tight' : 'no';
  let firstShort = null;
  if (after < 0) for (const x of series) { if (x.date > addDays(date, HORIZON)) break; if (x.date >= date && x.balance - price - allocated < 0) { firstShort = x.date; break; } }
  let earliest = null;
  if (verdict !== 'yes') for (let c = addDays(date, 1); c <= addDays(t, SEARCH); c = addDays(c, 1)) if (safeAfter(c) >= cushion) { earliest = c; break; }
  return { verdict, lowestAfter: after + allocated, safeAfter: after, lowestNow: baseMin, lowestNowDate: baseDay, firstShort, earliest, shortBy: after < 0 ? -after : 0, cushion };
}
