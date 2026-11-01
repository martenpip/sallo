// Fills a store with believable example data so people can look around before entering their own.
import { today, addDays, parse, toIso } from '../dates.js';
import { currencyInfo } from '../money.js';

export function buildDemo(s) {
  const t = today();
  const k = currencyInfo(s.settings.currency).exp ? 1 : 0.01; // amounts below are in hundredths
  const m = (v) => Math.round(v * k);
  const cat = (name) => s.data.categories.find((c) => c.name === name)?.id || null;
  const acc = s.add('accounts', { name: 'Everyday account', type: 'bank', openingMinor: m(90000), archived: false }).id;
  const sav = s.add('accounts', { name: 'Savings', type: 'savings', openingMinor: m(150000), archived: false }).id;

  const spend = [
    [1, 'Lidl', 3860, 'Groceries'], [2, 'Coffee', 420, 'Eating out'], [3, 'Bus pass', 3000, 'Transport'], [4, 'Pharmacy', 1290, 'Health'],
    [5, 'Dinner with friends', 4600, 'Eating out'], [7, 'Rimi', 2750, 'Groceries'], [8, 'Cinema', 1400, 'Leisure'], [10, 'Fuel', 5200, 'Transport'],
    [11, 'Lunch', 980, 'Eating out'], [13, 'Shoes', 6400, 'Shopping'], [14, 'Lidl', 4120, 'Groceries'], [16, 'Netflix', 1299, 'Leisure'],
    [18, 'Dentist', 7500, 'Health'], [19, 'Takeaway pizza', 1850, 'Eating out'], [21, 'Maxima', 3390, 'Groceries'], [24, 'Taxi', 1650, 'Transport'],
  ];
  for (const [ago, name, amt, c] of spend) s.addTxn({ type: 'expense', amountMinor: m(amt), name, accountId: acc, date: addDays(t, -ago), categoryId: cat(c), notes: '' });
  s.addTxn({ type: 'income', amountMinor: m(185000), name: 'Pay', accountId: acc, date: addDays(t, -12), categoryId: cat('Salary'), notes: '' });
  s.addTxn({ type: 'expense', amountMinor: m(55000), name: 'Rent', accountId: acc, date: addDays(t, -9), categoryId: cat('Housing'), notes: '' });

  const { y, m: mo } = parse(t);
  const onDay = (d) => { const a = toIso(y, mo, d); return a >= t ? a : (mo === 12 ? toIso(y + 1, 1, d) : toIso(y, mo + 1, d)); };
  const payRule = s.addRule({ kind: 'income', name: 'Pay', amountMinor: m(185000), categoryId: cat('Salary'), accountId: acc, startDate: addDays(t, 18), unit: 'month', every: 1 });
  s.addRule({ kind: 'expense', name: 'Rent', amountMinor: m(55000), categoryId: cat('Housing'), accountId: acc, startDate: onDay(3), unit: 'month', every: 1 });
  s.addRule({ kind: 'expense', name: 'Electricity', amountMinor: m(5800), categoryId: cat('Bills & utilities'), accountId: acc, startDate: onDay(15), unit: 'month', every: 1 });
  s.addRule({ kind: 'expense', name: 'Internet', amountMinor: m(1900), categoryId: cat('Bills & utilities'), accountId: acc, startDate: onDay(8), unit: 'month', every: 1 });
  s.addRule({ kind: 'expense', name: 'Netflix', amountMinor: m(1299), categoryId: cat('Leisure'), accountId: acc, startDate: onDay(16), unit: 'month', every: 1 });
  s.setSettings({ pay: { ruleId: payRule.id }, plan: { type: '50-30-20', needs: 50, wants: 30, save: 20, incomeMinor: m(185000) } });
  s.addPlanned({ kind: 'event', name: 'Dentist check-up', date: addDays(t, 6), time: '10:30', amountMinor: 0 });

  const bed = s.add('goals', { name: 'New bed', targetMinor: m(60000), deadline: addDays(t, 120), autoPct: 0, icon: 'home', archived: false, note: '' });
  s.add('contribs', { goalId: bed.id, amountMinor: m(15000), date: addDays(t, -10), note: 'From Pay' });
  const trip = s.add('goals', { name: 'Summer trip', targetMinor: m(120000), deadline: null, autoPct: 10, icon: 'plane', archived: false, note: '' });
  s.add('contribs', { goalId: trip.id, amountMinor: m(30000), date: addDays(t, -20), note: '' });
  const loanRule = s.addRule({ kind: 'expense', name: 'Laptop instalments', amountMinor: m(5000), categoryId: cat('Other'), accountId: acc, startDate: onDay(12), unit: 'month', every: 1 });
  s.add('debts', { name: 'Laptop instalments', direction: 'owe', startMinor: m(60000), aprBp: 0, monthlyMinor: m(5000), ruleId: loanRule.id, accountId: acc, startDate: addDays(t, -60), note: '', archived: false });
  s.add('repayments', { debtId: s.data.debts[0].id, amountMinor: m(10000), date: addDays(t, -30), txnId: null, note: '' });
  s.add('budgets', { categoryId: cat('Eating out'), limitMinor: m(15000) });
  s.add('budgets', { categoryId: cat('Groceries'), limitMinor: m(30000) });
  s.commit();
  void sav;
}
