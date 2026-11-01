import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinor, minorToPlain, formatMoney } from '../js/money.js';
import * as D from '../js/dates.js';
import { occurrence, occurrencesBetween, nextOnOrAfter } from '../js/recurrence.js';

test('parseMinor: separators', () => {
  const c = [['12,50', 1250], ['12.50', 1250], ['12', 1200], ['12.5', 1250], ['.5', 50], ['12.', 1200],
    ['1 234,5', 123450], ['1,234.56', 123456], ['1.234,56', 123456], ['1.234', 123400], ['1,234,567', 123456700],
    ['€ 5,00', 500], [' 7.25 ', 725], ['-5', -500], ['−5,5', -550], ['0', 0], ['0,00', 0]];
  for (const [i, o] of c) assert.equal(parseMinor(i), o, i);
});
test('parseMinor: ambiguous or invalid input returns null', () => {
  for (const i of ['', 'abc', '1.2345', '0.123', '1234567890123456', '1,2,3', '--5', '5-', null]) assert.equal(parseMinor(i), null, String(i));
});
test('parseMinor: zero-decimal currency', () => {
  assert.equal(parseMinor('1,234', 0), 1234);
  assert.equal(parseMinor('500', 0), 500);
  assert.equal(parseMinor('1.5', 0), null);
});
test('no float drift', () => {
  assert.equal(parseMinor('0.10') + parseMinor('0.20'), 30);
  assert.equal(parseMinor('19.99') * 3, 5997);
});
test('minorToPlain round trips through parse', () => {
  for (const v of [0, 1, 5, 99, 100, 123456, 99999999, -1250]) assert.equal(parseMinor(minorToPlain(v, 2)), v);
  assert.equal(minorToPlain(-1234, 2), '-12.34');
  assert.equal(minorToPlain(5, 2), '0.05');
  assert.equal(minorToPlain(1234, 0), '1234');
});
test('formatMoney uses a real minus and optional plus', () => {
  assert.equal(formatMoney(123456, 'EUR', { locale: 'en-US' }), '€1,234.56');
  assert.equal(formatMoney(-123456, 'EUR', { locale: 'en-US' }), '−€1,234.56');
  assert.equal(formatMoney(500, 'EUR', { locale: 'en-US', sign: true }), '+€5.00');
  assert.equal(formatMoney(0, 'EUR', { locale: 'en-US', sign: true }), '€0.00');
  assert.equal(formatMoney(1234, 'JPY', { locale: 'en-US' }), '¥1,234');
});

test('dates: clamping, DST-safe diff, week start, periods', () => {
  assert.equal(D.addMonthsClamped('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(D.addMonthsClamped('2024-01-31', 1, 31), '2024-02-29');
  assert.equal(D.addMonthsClamped('2026-01-31', 3, 31), '2026-04-30');
  assert.equal(D.addMonthsClamped('2026-12-15', 2), '2027-02-15');
  assert.equal(D.addMonthsClamped('2026-01-15', -2), '2025-11-15');
  assert.equal(D.dayDiff('2026-03-30', '2026-03-28'), 2);
  assert.equal(D.dayDiff('2026-11-02', '2026-10-30'), 3);
  assert.equal(D.startOfWeek('2026-10-30', 1), '2026-10-26');
  assert.equal(D.startOfWeek('2026-10-30', 7), '2026-10-25');
  assert.equal(D.startOfWeek('2026-10-26', 1), '2026-10-26');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.isIso('2026-02-29'), false);
  assert.equal(D.isIso('2028-02-29'), true);
  const p = D.periodFor('2026-01-10', 25);
  assert.equal(p.start, '2025-12-25'); assert.equal(p.endExclusive, '2026-01-25');
  assert.equal(D.periodFor('2026-01-25', 25).start, '2026-01-25');
  assert.equal(D.shiftPeriod(p, -1).start, '2025-11-25');
  assert.equal(D.periodFor('2026-03-05', 1).start, '2026-03-01');
});

const R = (o) => ({ startDate: '2026-01-31', unit: 'month', every: 1, endDate: null, ...o });
test('recurrence: 31st clamps and returns to the 31st', () => {
  const r = R({});
  assert.equal(occurrence(r.startDate, 'month', 1, 0), '2026-01-31');
  assert.equal(occurrence(r.startDate, 'month', 1, 1), '2026-02-28');
  assert.equal(occurrence(r.startDate, 'month', 1, 2), '2026-03-31');
  assert.equal(occurrence(r.startDate, 'month', 1, 3), '2026-04-30');
  assert.equal(occurrence(r.startDate, 'month', 1, 13), '2027-02-28');
  assert.equal(occurrence('2028-01-31', 'month', 1, 1), '2028-02-29');
});
test('recurrence: yearly 29 Feb, every 2 weeks, every 3 months', () => {
  assert.equal(occurrence('2024-02-29', 'year', 1, 1), '2025-02-28');
  assert.equal(occurrence('2024-02-29', 'year', 1, 4), '2028-02-29');
  assert.equal(occurrence('2026-03-28', 'week', 2, 1), '2026-04-11');
  assert.equal(occurrence('2026-01-15', 'month', 3, 2), '2026-07-15');
});
test('recurrence: between is inclusive, unique, respects end', () => {
  const r = R({});
  const l = occurrencesBetween(r, '2026-02-01', '2026-04-30');
  assert.deepEqual(l, ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(occurrencesBetween(R({ endDate: '2026-03-31' }), '2026-01-01', '2026-12-31'), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(nextOnOrAfter(R({ endDate: '2026-03-31' }), '2026-04-01'), null);
});
test('recurrence: far-past start still finds right dates', () => {
  const r = R({ startDate: '2020-01-01', unit: 'week' });
  assert.deepEqual(occurrencesBetween(r, '2026-01-01', '2026-01-31'), ['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
  assert.equal(nextOnOrAfter(R({ startDate: '2026-01-15' }), '2026-02-20'), '2026-03-15');
  assert.equal(nextOnOrAfter(R({ startDate: '2026-01-15' }), '2025-01-01'), '2026-01-15');
});

import { suggestSaving } from '../js/calc.js';
test('suggestSaving: percent, deadline-based, capped, and zero when done', () => {
  const g = { id: 'g', targetMinor: 60000, deadline: null, autoPct: 10 };
  assert.equal(suggestSaving(g, [], 200000, '2026-10-31'), 20000);
  assert.equal(suggestSaving({ ...g, autoPct: 0 }, [], 200000, '2026-10-31'), 20000); // no deadline: 10% default
  const dated = { id: 'g', targetMinor: 60000, deadline: '2027-01-15', autoPct: 0 };
  const s = suggestSaving(dated, [], 200000, '2026-10-31', 1);
  assert.ok(s > 0 && s <= 30000);
  assert.equal(suggestSaving(g, [{ goalId: 'g', amountMinor: 60000 }], 200000, '2026-10-31'), 0);
  assert.equal(suggestSaving({ ...g, autoPct: 50 }, [], 100000, '2026-10-31'), 50000);
  assert.equal(suggestSaving({ ...g, targetMinor: 1000, autoPct: 50 }, [], 100000, '2026-10-31'), 1000);
});

import { detectCategory } from '../js/categorize.js';
test('detectCategory: names map to categories', () => {
  const cats = [['Housing', 'expense'], ['Health', 'expense'], ['Groceries', 'expense'], ['Transport', 'expense'], ['Bills & utilities', 'expense'], ['Eating out', 'expense'], ['Leisure', 'expense'], ['Salary', 'income'], ['Other income', 'income']]
    .map(([name, kind], i) => ({ id: 'c' + i, name, kind, archived: false }));
  const id = (n) => cats.find((c) => c.name === n).id;
  assert.equal(detectCategory('Rent', 'expense', cats), id('Housing'));
  assert.equal(detectCategory('  Monthly RENT ', 'expense', cats), id('Housing'));
  assert.equal(detectCategory('Dentist', 'expense', cats), id('Health'));
  assert.equal(detectCategory('dentist appointment', 'expense', cats), id('Health'));
  assert.equal(detectCategory('Lidl', 'expense', cats), id('Groceries'));
  assert.equal(detectCategory('Car insurance', 'expense', cats), id('Transport')); // longer match beats "insurance"
  assert.equal(detectCategory('Internet', 'expense', cats), id('Bills & utilities'));
  assert.equal(detectCategory('Salary', 'income', cats), id('Salary'));
  assert.equal(detectCategory('Rent', 'income', cats), id('Other income')); // kind-aware
  assert.equal(detectCategory('Brent crude', 'expense', cats), null);      // whole words only
  assert.equal(detectCategory('x', 'expense', cats), null);
  assert.equal(detectCategory('Mystery', 'event', cats), null);
  assert.equal(detectCategory('Pottery class', 'expense', cats, [{ name: 'pottery class', categoryId: id('Leisure') }]), id('Leisure')); // learns
});

import { spendingGuard, isEssential } from '../js/calc.js';
test('spendingGuard: needs vs wants, shortfall and income share', () => {
  const cats = [{ id: 'h', name: 'Housing', kind: 'expense' }, { id: 'f', name: 'Eating out', kind: 'expense' }, { id: 's', name: 'Salary', kind: 'income' }, { id: 'c', name: 'Custom', kind: 'expense', essential: true }];
  assert.equal(isEssential(cats[0]), true); assert.equal(isEssential(cats[1]), false); assert.equal(isEssential(cats[3]), true);
  const accounts = [{ id: 'a', openingMinor: 100000, archived: false, type: 'checking', name: 'A' }];
  const base = { categories: cats, accounts, goals: [], contribs: [] };
  const opts = { start: '2026-10-01', endExclusive: '2026-11-01', today: '2026-10-31', addDaysFn: D.addDays, limitPct: 30 };
  const txns = [{ id: 't1', type: 'income', amountMinor: 100000, accountId: 'a', date: '2026-10-02', categoryId: 's' }, { id: 't2', type: 'expense', amountMinor: 50000, accountId: 'a', date: '2026-10-10', categoryId: 'f' }];
  const planned = [{ id: 'p1', status: 'planned', kind: 'expense', amountMinor: 140000, date: "2026-11-05", categoryId: 'h' }];
  const g = spendingGuard({ ...base, txns, planned }, opts);
  assert.equal(g.wantsSpent, 50000); assert.equal(g.essentialsDue, 140000); assert.equal(g.wantsPctOfIncome, 50);
  const codes = g.warnings.map((w) => w.code);
  assert.ok(codes.includes('shortfall') || codes.includes('tight'));
  assert.ok(codes.includes('wants-income'));
  const calm = spendingGuard({ ...base, txns: [txns[0]], planned: [] }, opts);
  assert.deepEqual(calm.warnings, []);
});

import { safeToSpend } from '../js/calc.js';
test('safeToSpend: bills before next income and goals come off the balance', () => {
  const accounts = [{ id: 'a', openingMinor: 100000, archived: false, type: 'bank', name: 'A' }];
  const planned = [
    { status: 'planned', kind: 'expense', amountMinor: 30000, date: '2026-11-03' },
    { status: 'planned', kind: 'expense', amountMinor: 50000, date: '2026-11-20' }, // after payday: not counted
    { status: 'planned', kind: 'income', amountMinor: 200000, date: '2026-11-10' },
  ];
  const goals = [{ id: 'g', archived: false, targetMinor: 99999 }], contribs = [{ goalId: 'g', amountMinor: 10000 }];
  const r = safeToSpend({ accounts, txns: [], planned, goals, contribs }, '2026-11-01', '2026-12-01');
  assert.equal(r.bills, 30000); assert.equal(r.safe, 60000); assert.equal(r.days, 9); assert.equal(r.perDay, 6666); assert.equal(r.byIncome, true);
  const none = safeToSpend({ accounts, txns: [], planned: [planned[0]], goals: [], contribs: [] }, '2026-11-01', '2026-12-01');
  assert.equal(none.until, '2026-12-01'); assert.equal(none.byIncome, false);
  const short = safeToSpend({ accounts, txns: [], planned: [{ status: 'planned', kind: 'expense', amountMinor: 150000, date: '2026-11-02' }], goals: [], contribs: [] }, '2026-11-01', '2026-12-01');
  assert.equal(short.safe, -50000); assert.equal(short.perDay, 0);
});

test('spendingGuard: an expected salary counts before it has landed', () => {
  const cats = [{ id: 'f', name: 'Eating out', kind: 'expense' }];
  const accounts = [{ id: 'a', openingMinor: 100000, archived: false, type: 'bank', name: 'A' }];
  const txns = [{ id: 't', type: 'expense', amountMinor: 30000, accountId: 'a', date: '2026-10-05', categoryId: 'f' }];
  const o = { start: '2026-10-01', endExclusive: '2026-11-01', today: '2026-10-31', addDaysFn: D.addDays, limitPct: 30 };
  const none = spendingGuard({ txns, planned: [], categories: cats, accounts, goals: [], contribs: [] }, o);
  assert.ok(!none.warnings.some((w) => w.code === 'wants-income'));
  const exact = spendingGuard({ txns, planned: [], categories: cats, accounts, goals: [], contribs: [] }, { ...o, expectedIncome: 100000 });
  assert.equal(exact.wantsPctOfIncome, 30); // exactly at the limit: no warning
  assert.ok(!exact.warnings.some((w) => w.code === 'wants-income'));
  const g = spendingGuard({ txns, planned: [], categories: cats, accounts, goals: [], contribs: [] }, { ...o, expectedIncome: 80000 });
  assert.ok(g.warnings.some((w) => w.code === 'wants-income'));
});

import { PLANS, planSplit, fittingPlan, monthlyOf, fixedEssentialsMonthly } from '../js/calc.js';
test('money plans: splits add up, rules are monthly, best-fit plan is chosen', () => {
  for (const p of PLANS) assert.equal(p.needs + p.wants + p.save, 100);
  assert.deepEqual(planSplit(140000, PLANS[0]), { needs: 70000, wants: 42000, save: 28000 });
  const odd = planSplit(100001, PLANS[0]); assert.equal(odd.needs + odd.wants + odd.save, 100001);
  assert.equal(monthlyOf({ amountMinor: 10000, unit: 'week', every: 1 }), Math.round(10000 * 52 / 12));
  assert.equal(monthlyOf({ amountMinor: 50000, unit: 'month', every: 1 }), 50000);
  const cats = [{ id: 'h', name: 'Housing', kind: 'expense' }, { id: 'l', name: 'Leisure', kind: 'expense' }];
  const rules = [{ kind: 'expense', amountMinor: 60000, unit: 'month', every: 1, categoryId: 'h' }, { kind: 'expense', amountMinor: 9999, unit: 'month', every: 1, categoryId: 'l' }];
  assert.equal(fixedEssentialsMonthly(rules, cats), 60000);
  assert.equal(fittingPlan(45).id, '50-30-20'); assert.equal(fittingPlan(55).id, '60-30-10'); assert.equal(fittingPlan(65).id, '70-20-10'); assert.equal(fittingPlan(90).id, '70-20-10');
  assert.equal(fittingPlan(30).id, '40-30-30');
});

import { projectCashflow, safeToSpendProjected, isWorkDay, monthlyFromWork } from '../js/calc.js';
test('timeline: 100/day, 1050 saved, dentist 650 on the 13th, bills on the 21st', () => {
  const accounts = [{ id: 'a', openingMinor: 105000, archived: false, type: 'bank', name: 'A' }];
  const wp = { dailyMinor: 10000, weekdays: [1, 2, 3, 4, 5], off: [] };
  // 2026-11-02 is a Monday. From Sunday 1 Nov: work days 2,3,4,5,6,9,10,11,12 = 9 before the 13th (Fri). Use days off to make it 8 like the story.
  const wp8 = { ...wp, off: ['2026-11-02'] };
  const planned = [
    { id: 'd', status: 'planned', kind: 'expense', name: 'Dentist', amountMinor: 65000, date: '2026-11-13' },
    { id: 'r', status: 'planned', kind: 'expense', name: 'Rent', amountMinor: 50000, date: '2026-11-21' },
    { id: 'u', status: 'planned', kind: 'expense', name: 'Electricity', amountMinor: 6000, date: '2026-11-21' },
  ];
  assert.equal(isWorkDay(wp, '2026-11-02'), true); assert.equal(isWorkDay(wp, '2026-11-01'), false); assert.equal(isWorkDay(wp8, '2026-11-02'), false);
  const pr = projectCashflow({ accounts, txns: [], planned, workPay: wp8 }, '2026-11-01', '2026-11-30');
  const [w1, dentist, w2, bills] = pr.steps;
  assert.equal(w1.type, 'work'); assert.equal(w1.days, 8); assert.equal(w1.total, 80000);
  assert.equal(dentist.balanceBefore, 185000); assert.equal(dentist.balanceAfter, 120000);
  assert.equal(w2.days, 6); // 13th (paid after the dentist that day), 16-20
  assert.equal(bills.items.length, 2); assert.equal(bills.net, -56000);
  assert.equal(pr.firstShort, null);
  // short case
  const poor = projectCashflow({ accounts: [{ id: 'a', openingMinor: 10000, archived: false, type: 'bank', name: 'A' }], txns: [], planned: [{ ...planned[0], amountMinor: 150000 }], workPay: wp }, '2026-11-01', '2026-11-30');
  assert.ok(poor.firstShort && poor.firstShort.short > 0 && poor.needDays >= 1);
  const sp = safeToSpendProjected({ accounts, txns: [], planned, goals: [], contribs: [], workPay: wp8 }, '2026-11-01', 30);
  assert.ok(sp.safe <= 105000 && sp.safe > 0);
  assert.equal(monthlyFromWork(wp), Math.round(10000 * 5 * 52 / 12));
});

test('work days: usual weekdays, days off and hand-picked extra days', () => {
  const wp = { dailyMinor: 10000, weekdays: [1, 2, 3, 4, 5], off: ['2026-11-03'], extra: ['2026-11-07'] }; // Sat 7 Nov extra, Tue 3 Nov off
  assert.equal(isWorkDay(wp, '2026-11-02'), true);   // Monday
  assert.equal(isWorkDay(wp, '2026-11-03'), false);  // day off
  assert.equal(isWorkDay(wp, '2026-11-07'), true);   // extra Saturday
  assert.equal(isWorkDay(wp, '2026-11-08'), false);  // Sunday
  const picked = { dailyMinor: 10000, weekdays: [], off: [], extra: ['2026-11-10', '2026-11-12'] };
  assert.equal(isWorkDay(picked, '2026-11-10'), true); assert.equal(isWorkDay(picked, '2026-11-11'), false);
});

test('projectCashflow leaves out the skipped salary rule', () => {
  const accounts = [{ id: 'a', openingMinor: 0 }];
  const planned = [{ id: 'p', status: 'planned', kind: 'income', amountMinor: 100000, date: '2026-11-05', ruleId: 'r' }];
  const wp = { dailyMinor: 1000, weekdays: [1, 2, 3, 4, 5], off: [], extra: [] };
  const withIt = projectCashflow({ accounts, txns: [], planned, workPay: wp }, '2026-11-01', '2026-11-10');
  const without = projectCashflow({ accounts, txns: [], planned, workPay: wp, skipRuleId: 'r' }, '2026-11-01', '2026-11-10');
  assert.equal(withIt.end - without.end, 100000);
});

import { debtPaid, debtLeft, payoffPlan, debtTotals } from '../js/calc.js';
test('debt balance counts repayments, paid scheduled payments and interest added', () => {
  const debt = { id: 'd', startMinor: 100000, ruleId: 'r', direction: 'owe' };
  const reps = [{ debtId: 'd', amountMinor: 20000 }, { debtId: 'd', amountMinor: -500 }, { debtId: 'x', amountMinor: 99999 }];
  const planned = [{ ruleId: 'r', status: 'done', amountMinor: 10000 }, { ruleId: 'r', status: 'planned', amountMinor: 10000 }];
  assert.equal(debtPaid(debt, reps, planned), 29500);
  assert.equal(debtLeft(debt, reps, planned), 70500);
  assert.equal(debtLeft(debt, [{ debtId: 'd', amountMinor: 999999 }], []), 0);
});
test('payoff: no interest, with interest, and never', () => {
  assert.deepEqual(payoffPlan(100000, 0, 25000), { months: 4, interest: 0, never: false });
  const w = payoffPlan(100000, 1200, 10000); // 12% a year, 1% a month
  assert.equal(w.never, false); assert.equal(w.months, 11); assert.ok(w.interest > 3000 && w.interest < 6000);
  assert.equal(payoffPlan(100000, 1200, 1000).never, true); // doesn't cover the interest
  assert.equal(payoffPlan(100000, 0, 0).noPayment, true);
});
test('debt totals split what you owe from what is owed to you', () => {
  const t = debtTotals([{ id: 'a', startMinor: 5000, direction: 'owe' }, { id: 'b', startMinor: 3000, direction: 'owed' }, { id: 'c', startMinor: 100, direction: 'owe' }], [{ debtId: 'c', amountMinor: 100 }]);
  assert.deepEqual(t, { owe: 5000, owed: 3000, nOwe: 1, nOwed: 1 });
});

import { ledger, sharePct, buildShareFile, validateShare, applyShare } from '../js/household.js';
import { cleanHousehold } from '../js/store.js';
const hh = (mode = 'half', extra = {}) => cleanHousehold({ personId: 'me', partnerId: 'her', config: { names: { me: 'Marten', her: 'Anna' }, incomes: { me: 1000, her: 3000 }, split: { mode, pctById: { me: 60, her: 40 } }, budgetMinor: 100000, configAt: '2026-11-01T00:00:00.000Z', ...extra } });
test('split: half, by income, custom', () => {
  assert.equal(sharePct(hh('half').config, 'me', 'her'), 50);
  assert.equal(sharePct(hh('income').config, 'me', 'her'), 25);
  assert.equal(sharePct(hh('custom').config, 'me', 'her'), 60);
});
test('ledger: who paid, who owes whom, month filter', () => {
  const mine = [{ date: '2026-11-03', amountMinor: 60000, categoryName: 'Housing' }, { date: '2026-10-30', amountMinor: 999, categoryName: 'Other' }];
  const theirs = [{ date: '2026-11-05', amountMinor: 20000, categoryName: 'Groceries' }];
  const l = ledger({ household: hh('half'), mine, theirs, start: '2026-11-01', endExclusive: '2026-12-01' });
  assert.equal(l.total, 80000); assert.equal(l.shareMe, 40000); assert.equal(l.balance, 20000); // partner owes me 200
  assert.equal(l.byCategory[0].name, 'Housing'); assert.equal(l.count, 2);
  const l2 = ledger({ household: hh('income'), mine, theirs, start: '2026-11-01', endExclusive: '2026-12-01' });
  assert.equal(l2.shareMe, 20000); assert.equal(l2.balance, 40000);
});
test('share file round trip: only shared expenses go out; import replaces and adopts newer settings', () => {
  const sender = { settings: { household: hh('half') }, categories: [{ id: 'c', name: 'Housing' }], txns: [
    { id: 't1', type: 'expense', shared: true, date: '2026-11-03', amountMinor: 5000, name: 'Rent', categoryId: 'c' },
    { id: 't2', type: 'expense', shared: false, date: '2026-11-03', amountMinor: 700, name: 'Private', categoryId: 'c' },
    { id: 't3', type: 'income', shared: true, date: '2026-11-03', amountMinor: 900, name: 'Pay', categoryId: null }] };
  const file = buildShareFile(sender, { today: '2026-11-10' });
  assert.deepEqual(file.txns.map((t) => t.id), ['t1']);
  const v = validateShare(JSON.parse(JSON.stringify(file)));
  const receiver = { settings: { household: null }, sharedIn: [] };
  const r = applyShare(receiver, v);
  assert.equal(r.ok, true); assert.equal(r.created, true);
  assert.equal(receiver.settings.household.partnerId, 'me');
  assert.equal(receiver.settings.household.config.names.me, 'Marten');
  assert.equal(receiver.sharedIn.length, 1);
  // a second file replaces the first (deletions propagate)
  file.txns = []; const v2 = validateShare(JSON.parse(JSON.stringify(file)));
  applyShare(receiver, v2);
  assert.equal(receiver.sharedIn.length, 0);
  // a file from someone else needs confirmation
  const other = validateShare({ app: 'sallo', kind: 'household', v: 1, from: { id: 'x', name: 'Bob' }, txns: [] });
  assert.equal(applyShare(receiver, other).needsConfirm, 'other-partner');
});
test('share file validation rejects junk and backups', () => {
  assert.throws(() => validateShare({ app: 'sallo', schema: 1 }), /normal Sallo backup/);
  assert.throws(() => validateShare(null), /not from Sallo/);
  const v = validateShare({ app: 'sallo', kind: 'household', v: 1, from: { id: 'a' }, txns: [{ id: 'x', date: '2026-01-01', amountMinor: -5 }, { id: 'y', date: 'bad', amountMinor: 5 }, { id: 'z', date: '2026-01-01', amountMinor: 5 }] });
  assert.equal(v.txns.length, 1);
});

test('first file from a partner links a manually set up household without asking', () => {
  const mine = cleanHousehold({ personId: 'me', partnerId: 'placeholder', partnerLinked: false, config: { names: { me: 'Marten', placeholder: 'Anna' }, incomes: {}, split: { mode: 'custom', pctById: { me: 60, placeholder: 40 } }, budgetMinor: 5000, configAt: '2026-11-01T00:00:00.000Z' } });
  const data = { settings: { household: mine }, sharedIn: [] };
  const v = validateShare({ app: 'sallo', kind: 'household', v: 1, from: { id: 'her-real', name: 'Anna' }, txns: [{ id: 'x', date: '2026-11-02', amountMinor: 100 }] });
  const r = applyShare(data, v);
  assert.equal(r.ok, true);
  assert.equal(data.settings.household.partnerId, 'her-real');
  assert.equal(data.settings.household.config.names['her-real'], 'Anna');
  assert.equal(data.settings.household.config.split.pctById['her-real'], 40);
  assert.equal(data.sharedIn.length, 1);
});

import { dailyBalances, affordCheck } from '../js/calc.js';
test('can I afford it: yes, tight, no, and the earliest date', () => {
  const accounts = [{ id: 'a', openingMinor: 100000 }];
  const planned = [
    { status: 'planned', kind: 'expense', amountMinor: 60000, date: '2026-11-10', ruleId: null },   // rent
    { status: 'planned', kind: 'income', amountMinor: 150000, date: '2026-11-25', ruleId: null }]; // pay
  const data = { accounts, txns: [], planned, workPay: null };
  const t = '2026-11-01';
  const d = dailyBalances(data, t, '2026-11-30');
  assert.equal(d[0].balance, 100000); assert.equal(d.find((x) => x.date === '2026-11-10').balance, 40000); assert.equal(d.at(-1).balance, 190000);
  assert.equal(affordCheck(data, { price: 20000, date: t, today: t }).verdict, 'yes');
  assert.equal(affordCheck(data, { price: 38000, date: t, today: t, cushion: 5000 }).verdict, 'tight');
  const no = affordCheck(data, { price: 70000, date: t, today: t });
  assert.equal(no.verdict, 'no'); assert.equal(no.shortBy, 30000); assert.equal(no.firstShort, '2026-11-10'); assert.equal(no.earliest, '2026-11-25');
  // goals set aside are untouched
  assert.equal(affordCheck(data, { price: 15000, date: t, today: t, allocated: 20000 }).verdict, 'yes');
  assert.equal(affordCheck(data, { price: 15000, date: t, today: t, allocated: 20000, cushion: 20000 }).verdict, 'tight');
  // work-day pay counts
  const wp = { dailyMinor: 10000, weekdays: [1, 2, 3, 4, 5], off: [], extra: [] };
  assert.equal(affordCheck({ ...data, workPay: wp }, { price: 70000, date: t, today: t }).verdict, 'yes');
});

import { findSubscriptions, subscriptionTotals, merchantKey } from '../js/subscriptions.js';
test('subscriptions: finds steady monthly charges, ignores groceries', () => {
  const tx = (name, date, amountMinor) => ({ id: name + date, type: 'expense', name, date, amountMinor, accountId: 'a' });
  const txns = [
    tx('Netflix.com 1234', '2026-07-05', 1299), tx('NETFLIX.COM 9921', '2026-08-05', 1299), tx('Netflix.com', '2026-09-05', 1299), tx('Netflix.com', '2026-10-05', 1499),
    tx('Lidl', '2026-10-01', 2310), tx('Lidl', '2026-10-08', 4120), tx('Lidl', '2026-10-15', 1500), tx('Lidl', '2026-10-22', 6800),
    tx('Gym Club', '2026-05-02', 3500), tx('Gym Club', '2026-06-02', 3500), tx('Gym Club', '2026-07-02', 3500),
    tx('Yearly Cloud', '2025-10-20', 9900), tx('Yearly Cloud', '2026-10-20', 9900),
  ];
  const subs = findSubscriptions(txns, [{ kind: 'expense', name: 'Gym Club' }], '2026-10-30');
  const by = Object.fromEntries(subs.map((s) => [s.key, s]));
  assert.ok(by['netflix com'] && by['netflix com'].period === 'month' && by['netflix com'].active);
  assert.equal(by['netflix com'].priceChange.to, 1499);
  assert.ok(!by['lidl']);
  assert.equal(by['gym club'].active, false); // last charge was in July
  assert.equal(by['gym club'].tracked, true);
  assert.equal(by['yearly cloud'].period, 'year');
  assert.equal(by['yearly cloud'].monthlyMinor, Math.round(9900 * 30.4375 / 365));
  const tot = subscriptionTotals(subs);
  assert.equal(tot.count, 2);
  assert.equal(merchantKey('Netflix.com 1234'), 'netflix com');
});

import { setLang, tr, compile, fill } from '../js/i18n.js';
test('i18n: exact phrases, patterns, plural endings and English passthrough', () => {
  assert.equal(tr('Savings'), 'Savings'); // English is the default and passes through
  setLang('et');
  assert.equal(tr('Savings'), 'Säästud');
  assert.equal(tr('€5.00 to pay'), '€5.00 tasuda');
  assert.equal(fill('{0} tehing{1?ut}', { 0: 3, 1: 's' }), '3 tehingut');
  assert.equal(fill('{0} tehing{1?ut}', { 0: 1, 1: '' }), '1 tehing');
  const parts = compile(['<b>', '</b> Cancel ']);
  assert.ok(parts.join('|').includes('Tühista'));
  setLang('en');
});
