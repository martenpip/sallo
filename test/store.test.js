import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, emptyData, buildExport, validateImport, mergeData, transactionsCsv } from '../js/store.js';
import * as C from '../js/calc.js';
import { minorToPlain, currencyInfo } from '../js/money.js';
import * as V from '../js/vault.js';

function mk(todayIso = '2026-10-30') {
  const s = new Store(emptyData(), { today: () => todayIso });
  s.main = s.add('accounts', { name: 'Main', type: 'bank', openingMinor: 100000, archived: false });
  s.sav = s.add('accounts', { name: 'Savings', type: 'savings', openingMinor: 0, archived: false });
  s.food = s.categoriesOf('expense')[0];
  return s;
}

test('balances: income, expense, transfer', () => {
  const s = mk();
  s.addTxn({ type: 'expense', amountMinor: 2500, accountId: s.main.id, categoryId: s.food.id, date: '2026-10-01' });
  s.addTxn({ type: 'income', amountMinor: 50000, accountId: s.main.id, date: '2026-10-02' });
  s.addTxn({ type: 'transfer', amountMinor: 10000, accountId: s.main.id, toAccountId: s.sav.id, date: '2026-10-03' });
  const b = C.accountBalances(s.data.accounts, s.data.txns);
  assert.equal(b.get(s.main.id), 100000 - 2500 + 50000 - 10000);
  assert.equal(b.get(s.sav.id), 10000);
  assert.equal(C.totalBalance(s.data.accounts, b), 100000 - 2500 + 50000); // transfer is neutral
  const t = C.periodTotals(s.data.txns, '2026-10-01', '2026-11-01');
  assert.deepEqual(t, { income: 50000, expense: 2500, net: 47500 }); // transfers excluded
});

test('recurring: 31st never duplicates, survives repeated ensureHorizon', () => {
  const s = mk('2026-01-01');
  const r = s.addRule({ kind: 'expense', name: 'Rent', amountMinor: 50000, startDate: '2026-01-31', unit: 'month', every: 1, accountId: s.main.id });
  const dates = s.data.planned.filter((p) => p.ruleId === r.id).map((p) => p.date);
  assert.deepEqual(dates.slice(0, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const n = s.data.planned.length;
  s.ensureHorizon(); s.ensureHorizon();
  assert.equal(s.data.planned.length, n);
  assert.equal(new Set(dates).size, dates.length);
  // ~400 day horizon
  assert.ok(dates.at(-1) >= '2027-01-31' && dates.at(-1) <= '2027-02-28');
});

test('recurring: single-occurrence edit and skip survive a series edit', () => {
  const s = mk('2026-01-01');
  const r = s.addRule({ kind: 'expense', name: 'Gym', amountMinor: 3000, startDate: '2026-01-15', unit: 'month', every: 1 });
  const feb = s.data.planned.find((p) => p.ruleId === r.id && p.date === '2026-02-15');
  const mar = s.data.planned.find((p) => p.ruleId === r.id && p.date === '2026-03-15');
  s.updatePlanned(feb.id, { amountMinor: 1000 });
  s.deletePlanned(mar.id); // = skip, never regenerated
  s.updateRule(r.id, { amountMinor: 4000 });
  const after = (d) => s.data.planned.find((p) => p.ruleId === r.id && p.date === d);
  assert.equal(after('2026-02-15').amountMinor, 1000);
  assert.equal(after('2026-03-15').status, 'skipped');
  assert.equal(after('2026-04-15').amountMinor, 4000);
  assert.equal(s.data.planned.filter((p) => p.ruleId === r.id && p.date === '2026-03-15').length, 1);
});

test('rule starting in the past does not flood overdue items', () => {
  const s = mk('2026-10-30');
  const r = s.addRule({ kind: 'expense', name: 'Phone', amountMinor: 1500, startDate: '2026-01-05', unit: 'month', every: 1 });
  const first = s.data.planned.filter((p) => p.ruleId === r.id)[0];
  assert.equal(first.date, '2026-11-05');
});

test('pause, resume, end and delete a rule', () => {
  const s = mk('2026-01-01');
  const r = s.addRule({ kind: 'income', name: 'Pay', amountMinor: 200000, startDate: '2026-01-25', unit: 'month', every: 1 });
  s.pauseRule(r.id, true);
  assert.equal(s.data.planned.filter((p) => p.ruleId === r.id).length, 0);
  s.pauseRule(r.id, false);
  assert.ok(s.data.planned.filter((p) => p.ruleId === r.id).length > 10);
  s.endRule(r.id, '2026-03-31');
  assert.equal(s.data.planned.filter((p) => p.ruleId === r.id).at(-1).date, '2026-03-25');
  s.ensureHorizon();
  assert.equal(s.data.planned.filter((p) => p.ruleId === r.id).at(-1).date, '2026-03-25');
  const jan = s.data.planned.find((p) => p.ruleId === r.id);
  s.markPaid(jan.id, { accountId: s.main.id });
  s.deleteRule(r.id);
  assert.equal(s.data.rules.length, 0);
  assert.equal(s.data.planned.length, 1); // paid history kept
  assert.equal(s.data.planned[0].ruleId, null);
});

test('mark paid creates exactly one transaction; undo and delete re-open', () => {
  const s = mk();
  const p = s.addPlanned({ kind: 'expense', name: 'Insurance', amountMinor: 8000, date: '2026-10-31', accountId: s.main.id });
  const t = s.markPaid(p.id);
  assert.equal(s.markPaid(p.id), null); // no double pay
  assert.equal(s.data.txns.length, 1);
  assert.equal(t.amountMinor, 8000);
  assert.equal(s.get('planned', p.id).status, 'done');
  s.undoPaid(p.id);
  assert.equal(s.data.txns.length, 0);
  s.markPaid(p.id, { amountMinor: 7500 });
  s.deleteTxn(s.data.txns[0].id);
  assert.equal(s.get('planned', p.id).status, 'planned');
  assert.throws(() => { const e = new Store(emptyData()); const q = e.addPlanned({ kind: 'expense', name: 'x', amountMinor: 1, date: '2026-01-01' }); e.markPaid(q.id); }, /account/i);
});

test('status and grouping', () => {
  const t = '2026-10-30'; // Friday
  const P = (date, o = {}) => ({ id: date + (o.name || ''), kind: 'expense', name: 'x', date, status: 'planned', ...o });
  assert.equal(C.displayStatus(P('2026-10-29'), t), 'overdue');
  assert.equal(C.displayStatus(P('2026-10-30'), t), 'due');
  assert.equal(C.displayStatus(P('2026-11-02'), t), 'upcoming');
  assert.equal(C.displayStatus(P('2026-10-29', { status: 'done' }), t), 'paid');
  assert.equal(C.groupFor('2026-10-29', t), 'overdue');
  assert.equal(C.groupFor('2026-10-30', t), 'today');
  assert.equal(C.groupFor('2026-10-31', t), 'tomorrow');
  assert.equal(C.groupFor('2026-11-01', t), 'week');       // Sunday, same Mon-start week
  assert.equal(C.groupFor('2026-11-02', t), 'nextweek');
  assert.equal(C.groupFor('2026-11-09', t), 'later');
  assert.equal(C.groupFor('2026-10-31', '2026-10-05'), 'month');
  const g = C.groupUpcoming([P('2026-12-01'), P('2026-10-29'), P('2026-10-30', { status: 'done' })], t);
  assert.deepEqual(g.map((x) => x.key), ['overdue', 'later']);
});

test('budgets, forecast, goals, insights', () => {
  const s = mk();
  s.addTxn({ type: 'expense', amountMinor: 8000, accountId: s.main.id, categoryId: s.food.id, date: '2026-10-05' });
  s.addTxn({ type: 'expense', amountMinor: 2000, accountId: s.main.id, categoryId: s.food.id, date: '2026-10-06' });
  const b = { categoryId: s.food.id, limitMinor: 10000 };
  assert.equal(C.budgetStatus(b, s.data.txns, '2026-10-01', '2026-11-01').state, 'near');
  assert.equal(C.budgetStatus({ ...b, limitMinor: 9000 }, s.data.txns, '2026-10-01', '2026-11-01').state, 'over');
  assert.equal(C.budgetStatus({ ...b, limitMinor: 50000 }, s.data.txns, '2026-10-01', '2026-11-01').state, 'ok');
  assert.deepEqual(C.mostExpensiveDay(s.data.txns, '2026-10-01', '2026-11-01'), { date: '2026-10-05', total: 8000 });
  s.addPlanned({ kind: 'expense', name: 'a', amountMinor: 1000, date: '2026-11-02' });
  s.addPlanned({ kind: 'income', name: 'b', amountMinor: 5000, date: '2026-11-03' });
  s.addPlanned({ kind: 'event', name: 'c', date: '2026-11-03' });
  assert.equal(C.forecast(1000, s.data.planned, '2026-10-30', '2026-11-30'), 1000 - 1000 + 5000);
  const goal = s.add('goals', { name: 'Trip', targetMinor: 120000, deadline: '2027-01-31', icon: 'plane' });
  s.add('contribs', { goalId: goal.id, amountMinor: 30000, date: '2026-10-01' });
  s.add('contribs', { goalId: goal.id, amountMinor: -5000, date: '2026-10-02' });
  const gp = C.goalProgress(goal, s.data.contribs, '2026-10-30');
  assert.equal(gp.saved, 25000); assert.equal(gp.pct, 20);
  assert.equal(gp.perMonth, Math.ceil(95000 / 3)); // Nov, Dec, Jan
  assert.equal(C.totalAllocated(s.data.goals, s.data.contribs), 25000);
});

test('archive vs delete when something is in use', () => {
  const s = mk();
  s.addTxn({ type: 'expense', amountMinor: 1, accountId: s.main.id, categoryId: s.food.id, date: '2026-10-01' });
  assert.equal(s.removeCategory(s.food.id), 'archived');
  assert.equal(s.removeAccount(s.main.id), 'archived');
  assert.equal(s.removeAccount(s.sav.id), 'deleted');
});

test('export -> validate -> same data; settings are cleaned', () => {
  const s = mk();
  s.addTxn({ type: 'expense', amountMinor: 1234, accountId: s.main.id, categoryId: s.food.id, date: '2026-10-01', name: 'Lunch' });
  s.addRule({ kind: 'expense', name: 'Rent', amountMinor: 50000, startDate: '2026-11-01', unit: 'month', every: 1 });
  const file = JSON.parse(JSON.stringify(buildExport(s.data)));
  assert.equal('hideAmounts' in file.settings, false);
  const { data, dropped } = validateImport(file);
  assert.equal(dropped, 0);
  for (const c of ['accounts', 'categories', 'txns', 'planned', 'rules']) assert.deepEqual(data[c], s.data[c], c);
});

test('import rejects junk and sanitises hostile records', () => {
  assert.throws(() => validateImport(null), /not a Sallo/);
  assert.throws(() => validateImport({ app: 'other' }), /not a Sallo/);
  assert.throws(() => validateImport({ app: 'sallo', schema: 99 }), /newer/);
  const evil = { app: 'sallo', schema: 1, settings: { currency: 'XXX', weekStart: 99, theme: '<b>' },
    accounts: [{ id: 'a1', name: '<img src=x onerror=alert(1)>' }, { id: 'a1', name: 'dup' }, { name: 'noid' }, 5, null],
    txns: [{ id: 't1', type: 'expense', amountMinor: 1.5, date: '2026-01-01', accountId: 'a1' },
      { id: 't2', type: 'expense', amountMinor: 100, date: '2026-02-30', accountId: 'a1' },
      { id: 't3', type: 'expense', amountMinor: 100, date: '2026-01-01', accountId: 'ghost' },
      { id: 't4', type: 'expense', amountMinor: 100, date: '2026-01-01', accountId: 'a1' }] };
  const { data, dropped, counts } = validateImport(evil);
  assert.equal(data.settings.currency, 'EUR'); assert.equal(data.settings.weekStart, 1); assert.equal(data.settings.theme, 'system');
  assert.equal(data.accounts.length, 1);
  assert.equal(counts.txns, 1); assert.equal(data.txns[0].id, 't4');
  assert.ok(dropped >= 6);
});

test('merge: adds new, newer wins, older ignored, no duplicates', () => {
  const a = mk(); a.addTxn({ type: 'expense', amountMinor: 100, accountId: a.main.id, date: '2026-10-01', name: 'one' });
  const incoming = JSON.parse(JSON.stringify(a.data));
  incoming.txns[0].name = 'edited'; incoming.txns[0].updatedAt = '2999-01-01T00:00:00.000Z';
  incoming.txns.push({ ...incoming.txns[0], id: 'new1', name: 'two', updatedAt: '2000-01-01T00:00:00.000Z' });
  const v = validateImport({ app: 'sallo', schema: 1, ...incoming });
  const { data, stats } = mergeData(a.data, v.data);
  assert.equal(data.txns.length, 2);
  assert.equal(data.txns.find((t) => t.id === a.data.txns[0].id).name, 'edited');
  assert.deepEqual(stats, { added: 1, updated: 1 });
  const again = mergeData(data, v.data);
  assert.equal(again.data.txns.length, 2);
  assert.deepEqual(again.stats, { added: 0, updated: 0 });
});

test('CSV: quoting and formula guard', () => {
  const s = mk();
  s.addTxn({ type: 'expense', amountMinor: 1250, accountId: s.main.id, date: '2026-10-01', name: '=HYPERLINK("http://x")', notes: 'a,b' });
  const csv = transactionsCsv(s.data, minorToPlain, currencyInfo('EUR'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'date,type,amount,currency,name,category,account,to_account,notes');
  assert.ok(lines[1].startsWith('2026-10-01,expense,12.50,EUR,"\'=HYPERLINK(""http://x"")",,Main,,"a,b"'), lines[1]);
});

test('encrypted backup: round trip, wrong passphrase, tamper, garbage', async () => {
  const data = { app: 'sallo', schema: 1, accounts: [{ id: 'x', name: 'Main' }] };
  const text = await V.encryptBackup(data, 'correct horse', 10000);
  assert.ok(!text.includes('Main'));
  const env = JSON.parse(text);
  assert.deepEqual(await V.decryptBackup(env, 'correct horse'), data);
  await assert.rejects(() => V.decryptBackup(env, 'wrong'), V.WrongSecretError);
  const bad = { ...env, ct: V.b64(Uint8Array.from(V.unb64(env.ct), (b, i) => (i === 3 ? b ^ 1 : b))) };
  await assert.rejects(() => V.decryptBackup(bad, 'correct horse'), V.WrongSecretError);
  await assert.rejects(() => V.decryptBackup({ sallo: 'encrypted-backup', v: 1, kdf: 'x' }, 'p'), V.BadFileError);
  await assert.rejects(() => V.decryptBackup({ sallo: 'encrypted-backup', v: 1, kdf: 'PBKDF2-SHA256', iterations: 5 }, 'p'), V.BadFileError);
  const t2 = await V.encryptBackup(data, 'correct horse', 10000);
  assert.notEqual(t2, text); // fresh salt and nonce
});

test('at-rest encryption helpers round trip', async () => {
  const salt = V.randomBytes(16);
  const key = await V.deriveKey('hunter22', salt, 10000);
  const blob = await V.encryptJson(key, { hello: 'world' });
  assert.deepEqual(await V.decryptJson(key, blob), { hello: 'world' });
  const other = await V.deriveKey('hunter23', salt, 10000);
  await assert.rejects(() => V.decryptJson(other, blob));
});

test('deleteAccountForGood removes the account and all its activity', () => {
  const s = mk();
  const cat = s.food;
  s.addTxn({ type: 'expense', amountMinor: 1000, accountId: s.main.id, categoryId: cat.id, date: '2026-10-01' });
  s.addTxn({ type: 'income', amountMinor: 5000, accountId: s.main.id, date: '2026-10-02' });
  s.addTxn({ type: 'transfer', amountMinor: 2000, accountId: s.main.id, toAccountId: s.sav.id, date: '2026-10-03' });
  s.addTxn({ type: 'expense', amountMinor: 300, accountId: s.sav.id, date: '2026-10-04' });
  const p = s.addPlanned({ kind: 'expense', name: 'Bill', amountMinor: 700, date: '2026-10-29', accountId: s.main.id });
  s.markPaid(p.id, { date: '2026-10-29', amountMinor: 700, accountId: s.main.id });
  const waiting = s.addPlanned({ kind: 'expense', name: 'Later', amountMinor: 100, date: '2026-11-20', accountId: s.main.id });
  const rule = s.addRule({ kind: 'expense', name: 'Rent', amountMinor: 500, accountId: s.main.id, startDate: '2026-11-01', unit: 'month', every: 1 });
  const fp = s.accountFootprint(s.main.id);
  assert.equal(fp.txns, 4); // expense, income, transfer out, paid bill
  s.deleteAccountForGood(s.main.id);
  assert.ok(!s.get('accounts', s.main.id));
  assert.ok(s.data.txns.every((t) => t.accountId !== s.main.id && t.toAccountId !== s.main.id));
  assert.equal(s.data.txns.length, 1); // only the savings expense is left
  assert.ok(!s.get('planned', p.id)); // the paid item went with its transaction
  assert.ok(!s.get('planned', waiting.id)); // linked to the deleted account: gone
  assert.ok(!s.get('rules', rule.id));
  assert.ok(!s.data.planned.some((x) => x.ruleId === rule.id));
  assert.equal(C.accountBalances(s.data.accounts, s.data.txns).get(s.sav.id), -300);
});

test('deleting the only account starts completely fresh', () => {
  const s = new Store(emptyData(), { today: () => '2026-10-30' });
  const a = s.add('accounts', { name: 'Only', type: 'bank', openingMinor: 1000, archived: false });
  s.addTxn({ type: 'expense', amountMinor: 100, accountId: a.id, date: '2026-10-01' });
  const r = s.addRule({ kind: 'income', name: 'Pay', amountMinor: 100000, accountId: null, startDate: '2026-11-01', unit: 'month', every: 1 });
  s.setSettings({ pay: { ruleId: r.id } });
  const g = s.add('goals', { name: 'Bed', targetMinor: 5000, deadline: null, icon: 'piggy', archived: false, note: '', autoPct: 0 });
  s.add('contribs', { goalId: g.id, amountMinor: 100, date: '2026-10-02', note: '' });
  s.add('budgets', { categoryId: '', limitMinor: 1000 });
  s.addPlanned({ kind: 'expense', name: 'x', amountMinor: 5, date: '2026-11-02' });
  const fp = s.accountFootprint(a.id);
  assert.equal(fp.last, true); assert.equal(fp.goals, 1);
  s.deleteAccountForGood(a.id);
  const d = s.data;
  assert.equal(d.accounts.length + d.txns.length + d.rules.length + d.planned.length + d.goals.length + d.contribs.length + d.budgets.length, 0);
  assert.equal(d.settings.pay, null);
  assert.ok(d.categories.length > 0);
});

test('debts and repayments survive export and import, and orphans are dropped', async () => {
  const { buildExport, validateImport, emptyData, Store } = await import('../js/store.js');
  const s = new Store(emptyData(), { today: () => '2026-11-01' });
  const acc = s.add('accounts', { name: 'A', type: 'bank', openingMinor: 0, archived: false });
  const debt = s.add('debts', { name: 'Loan', direction: 'owe', startMinor: 50000, aprBp: 500, monthlyMinor: 5000, ruleId: null, accountId: acc.id, startDate: '2026-10-01', note: '', archived: false });
  s.add('repayments', { debtId: debt.id, amountMinor: 10000, date: '2026-10-15', txnId: null, note: '' });
  const out = JSON.parse(JSON.stringify(buildExport(s.data)));
  out.repayments.push({ id: 'orphan', debtId: 'nope', amountMinor: 5, date: '2026-10-15' });
  const v = validateImport(JSON.parse(JSON.stringify(out)));
  assert.equal(v.data.debts.length, 1); assert.equal(v.data.debts[0].aprBp, 500);
  assert.equal(v.data.repayments.length, 1);
  // an old backup with no debts at all still loads
  const old = JSON.parse(JSON.stringify(out)); delete old.debts; delete old.repayments;
  assert.equal(validateImport(old).data.debts.length, 0);
  s.removeDebt(debt.id);
  assert.equal(s.data.repayments.length, 0);
});
